import path from 'node:path'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import { config } from './config.js'
import { connectDatabase, initTenant } from './db.js'
import { moduleGate, requireAuth } from './auth.js'
import { startScheduler } from './automation.js'
import { aiEnabled } from './ai.js'
import coreRoutes from './routes/core.js'
import academicRoutes from './routes/academics.js'
import examRoutes from './routes/exams.js'
import officeRoutes from './routes/office.js'
import portalRoutes from './routes/portal.js'
import parentRoutes from './routes/parent.js'
import lmsRoutes from './routes/lms.js'
import superadminRoutes from './routes/superadmin.js'
import transportRoutes from './routes/transport.js'
import payrollRoutes from './routes/payroll.js'
import financeRoutes from './routes/finance.js'
import certificateRoutes, { verifyCertificate } from './routes/certificates.js'
import { gpsPublic, gpsStaff } from './routes/gps.js'
import { activityLogger } from './activity.js'
import { ensureIndexes, runWithTenant } from './tenancy.js'
import { loadSigningKeys } from './license.js'
import platformRoutes from './platform/routes.js'
import { resolveTenant } from './platform/resolve.js'
import { ensureMainTenant, Tenant, tenantBlock, tenantCtx } from './platform/store.js'
import syncRoutes from './sync/central.js'
import { desktopGuard, desktopRoutes, loadLicense } from './desktop.js'
import { startSyncClient } from './sync/client.js'
import { hasModule } from '../shared/modules.js'

const desktop = config.mode === 'desktop'
const app = express()

// Only trust X-Forwarded-For from a proxy on this machine (Vite in dev, nginx/Apache in production).
app.set('trust proxy', 'loopback')
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(compression())
// Desktop apps sync through here (own body parser; the licence picks the institute).
if (!desktop) app.use('/api/sync', syncRoutes)
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
if (desktop) {
  app.use('/api/desktop', desktopRoutes)
  app.use('/api', desktopGuard)
} else {
  app.use('/api/platform', platformRoutes)
  app.use('/api', resolveTenant)
}
app.use('/api', moduleGate)
app.use('/api', activityLogger)

// Public certificate check (no login), lightly rate-limited against serial guessing.
const verifyHits = new Map()
app.get('/api/verify/:serial', (req, res, next) => {
  const now = Date.now()
  const hit = verifyHits.get(req.ip)
  const entry = hit && hit.until > now ? hit : { count: 0, until: now + 10 * 60_000 }
  entry.count++
  verifyHits.set(req.ip, entry)
  if (verifyHits.size > 5000) verifyHits.clear()
  if (entry.count > 30) return res.status(429).json({ error: 'Too many checks. Please try again in a few minutes.' })
  next()
}, verifyCertificate)

// Bus positions from drivers' phones and GPS trackers (no login; the tracking token identifies the bus).
if (!desktop) app.use('/api/gps', gpsPublic)

app.use('/api', coreRoutes)
app.use('/api/portal', requireAuth, portalRoutes)
app.use('/api/parent', requireAuth, parentRoutes)
// Examination before academics: its fixed paths (/exams/schedule…) must win over /exams/:id.
app.use('/api', requireAuth, examRoutes)
app.use('/api', requireAuth, academicRoutes)
app.use('/api', requireAuth, officeRoutes)
app.use('/api', requireAuth, lmsRoutes)
app.use('/api', requireAuth, superadminRoutes)
app.use('/api', requireAuth, transportRoutes)
// Live tracking needs the internet, so the desktop app does not have it.
if (!desktop) app.use('/api', requireAuth, gpsStaff)
app.use('/api', requireAuth, payrollRoutes)
app.use('/api', requireAuth, financeRoutes)
app.use('/api', requireAuth, certificateRoutes)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }))

// In production this server also serves the built React app.
if (config.isProduction) {
  app.use('/assets', express.static(path.join(config.paths.dist, 'assets'), { maxAge: '1y', immutable: true }))
  app.use(express.static(config.paths.dist, { index: false, maxAge: '1h' }))
  app.get(/.*/, (req, res) => res.sendFile(path.join(config.paths.dist, 'index.html')))
}

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error.name === 'ValidationError') {
    return res.status(422).json({ error: Object.values(error.errors).map((e) => e.message).join(' ') })
  }
  if (error.name === 'CastError') return res.status(400).json({ error: `Invalid value for ${error.path}.` })
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'value'
    return res.status(409).json({ error: `That ${field} is already in use.` })
  }
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' })
  if (error.status) return res.status(error.status).json({ error: error.message })
  console.error(error)
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
})

// Runs fn once per active institute (central server).
async function eachTenant(fn, module) {
  for (const tenant of await Tenant.find({ status: 'active' }).lean()) {
    if (tenantBlock(tenant) || !hasModule(tenant.modules, module)) continue
    await runWithTenant(tenantCtx(tenant), fn).catch((error) => console.error(`[${tenant.code}]`, error.message))
  }
}

try {
  await connectDatabase()
  if (desktop) {
    loadLicense()
    await ensureIndexes()
  } else {
    loadSigningKeys()
    // The database in MONGODB_URI is the "main" institute; the others come from the owner console.
    const main = await ensureMainTenant()
    await initTenant(main, { admin: config.auth.initialAdmin, demo: process.env.SEED_DEMO !== 'false' })
    for (const tenant of await Tenant.find({ isMain: { $ne: true }, status: 'active' }).lean()) await initTenant(tenant)
  }
} catch (error) {
  console.error(`[db] Could not start with MongoDB at ${config.mongoUri} - is MongoDB running?`)
  console.error(`     ${error.message}`)
  process.exit(1)
}

// Automation runs on the central server only, so messages are never queued twice.
if (desktop) startSyncClient()
else startScheduler((fn) => eachTenant(fn, 'automation'))

app.listen(config.port, config.host, () => {
  console.log(`[server] ${desktop ? 'Desktop' : 'Central'} API ready on http://${config.host || 'localhost'}:${config.port} (${config.isProduction ? 'production' : 'development'})`)
  if (desktop) console.log(`[sync] Central server: ${config.desktop.centralUrl}`)
  else console.log(config.platform.owner.email ? `[platform] Owner console: /owner (${config.platform.owner.email})` : '[platform] Set OWNER_EMAIL and OWNER_PASSWORD in .env to open the owner console at /owner')
  console.log(aiEnabled ? `[ai] AI enabled: ${config.ai.provider} (${config.ai.model}${config.ai.fallbackModel ? `, fallback ${config.ai.fallbackModel}` : ''})` : `[ai] ${config.ai.keyVar} not set - AI features are disabled, everything else works.`)
})
