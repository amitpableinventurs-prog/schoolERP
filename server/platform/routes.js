// Owner console API (/api/platform): you, the provider, manage every client institute -
// domains, modules, subscription, desktop installations - from one place.
// Also the public endpoints desktop apps and the TLS proxy call.
import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { initTenant } from '../db.js'
import { ActivityLog, Staff, Student, User } from '../models.js'
import { runWithTenant } from '../tenancy.js'
import { asyncHandler, httpError, pick } from '../util.js'
import { ALL_MODULES } from '../../shared/modules.js'
import {
  changeInstallation, cleanModules, clearTenantCache, createInstallation, deleteInstallation, effectiveModules, Installation, installationView, issueLicense,
  keyExpired, keyExpiredMessage, LISTED, renewInstallation, resetInstallationDevice, Tenant, tenantBlock, tenantCtx,
} from './store.js'

const router = Router()
const OWNER_COOKIE = 'sc_owner'
const { platform } = config

/* ── Public: TLS, activation, installer download ── */

// Caddy's on-demand TLS asks here before getting a certificate for a client domain.
router.get('/tls-check', asyncHandler(async (req, res) => {
  const domain = String(req.query.domain || '').toLowerCase()
  const known = platform.hosts.includes(domain)
    || (domain.endsWith(`.${platform.domain}`) && await Tenant.exists({ code: domain.slice(0, -platform.domain.length - 1) }))
    || await Tenant.exists({ domains: domain, status: 'active' })
  res.status(known ? 200 : 404).end()
}))

const failedActivations = new Map()
router.post('/license/activate', asyncHandler(async (req, res) => {
  const tries = failedActivations.get(req.ip)
  if (tries && tries.count >= 10 && tries.until > Date.now()) throw httpError(429, 'Too many wrong keys. Please wait 15 minutes.')
  const fail = (status, message) => {
    failedActivations.set(req.ip, { count: (tries?.until > Date.now() ? tries.count : 0) + 1, until: Date.now() + 15 * 60_000 })
    throw httpError(status, message)
  }
  const key = String(req.body.key || '').trim().toUpperCase()
  const machineId = String(req.body.machineId || '').slice(0, 200)
  if (!key || !machineId) throw httpError(422, 'Activation key and machine ID are required.')
  const inst = await Installation.findOne({ key })
  if (!inst || inst.status === 'deleted') fail(404, 'This activation key is not valid.')
  if (inst.status !== 'active') throw httpError(403, 'This activation key has been deactivated. Ask your super admin to activate it again.')
  if (keyExpired(inst)) throw httpError(402, keyExpiredMessage(inst))
  if (inst.machineId && inst.machineId !== machineId) {
    throw httpError(409, `This key is already in use on another computer (${inst.deviceName || 'unknown'}). Ask your super admin to move it to this computer.`)
  }
  const tenant = await Tenant.findById(inst.tenant).lean()
  const block = tenantBlock(tenant)
  if (block) throw httpError(block.status, block.message)
  inst.machineId = machineId
  inst.deviceName = String(req.body.deviceName || '').slice(0, 100)
  inst.appVersion = String(req.body.appVersion || '').slice(0, 20)
  inst.activatedAt ||= new Date()
  inst.lastSeenAt = new Date()
  await inst.save()
  failedActivations.delete(req.ip)
  res.json({
    license: issueLicense(tenant, inst),
    tenant: { code: tenant.code, name: tenant.name },
    installation: { label: inst.label, deviceCode: inst.deviceCode, modules: effectiveModules(tenant, inst) },
  })
}))

// Newest built installer (desktop/release/*.exe).
function installerFile() {
  try {
    const files = fs.readdirSync(platform.installerDir)
      .filter((f) => /setup.*\.exe$/i.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(platform.installerDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    return files[0] ? path.join(platform.installerDir, files[0].f) : null
  } catch {
    return null
  }
}

// The installer, named after the key: the app activates itself on first start.
// The key is the secret, so this link can be sent to the client directly.
router.get('/download/:key', asyncHandler(async (req, res) => {
  const inst = await Installation.findOne({ key: String(req.params.key).toUpperCase(), status: 'active' }).lean()
  if (!inst) throw httpError(404, 'Unknown or deactivated key.')
  const file = installerFile()
  if (!file) throw httpError(503, 'The installer has not been built yet (npm run desktop:build).')
  res.download(file, `SmartCampus-Setup-${inst.key}.exe`)
}))

/* ── Owner login ── */

// The owner console only opens on the platform's own hosts, never on a client's domain.
router.use((req, res, next) => {
  if (!platform.hosts.includes(String(req.hostname).toLowerCase())) return res.status(404).json({ error: 'Not found.' })
  next()
})

const sha = (text) => crypto.createHash('sha256').update(String(text)).digest()
const sameText = (a, b) => crypto.timingSafeEqual(sha(a), sha(b))

const ownerAttempts = new Map()
router.post('/login', asyncHandler(async (req, res) => {
  const { owner } = platform
  if (!owner.email || !owner.password) throw httpError(503, 'Set OWNER_EMAIL and OWNER_PASSWORD in .env to use the owner console.')
  const entry = ownerAttempts.get(req.ip)
  if (entry && entry.count >= 8 && entry.until > Date.now()) throw httpError(429, 'Too many attempts. Please wait 15 minutes.')
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const ok = sameText(email, owner.email) & sameText(password, owner.password)
  if (!ok) {
    ownerAttempts.set(req.ip, { count: (entry?.until > Date.now() ? entry.count : 0) + 1, until: Date.now() + 15 * 60_000 })
    throw httpError(401, 'Wrong email or password.')
  }
  ownerAttempts.delete(req.ip)
  const token = jwt.sign({ owner: true, email }, config.auth.jwtSecret, { expiresIn: '12h' })
  res.cookie(OWNER_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.isProduction, path: '/api/platform', maxAge: 12 * 3600_000 })
  res.json({ owner: { name: owner.name, email } })
}))

router.post('/logout', (req, res) => {
  res.clearCookie(OWNER_COOKIE, { path: '/api/platform' })
  res.json({ ok: true })
})

router.use((req, res, next) => {
  try {
    const payload = jwt.verify(req.cookies?.[OWNER_COOKIE] || '', config.auth.jwtSecret)
    if (!payload.owner) throw new Error('not owner')
    req.owner = payload
    next()
  } catch {
    res.status(401).json({ error: 'Please log in to the owner console.' })
  }
})

router.get('/me', (req, res) => res.json({ owner: { name: platform.owner.name, email: req.owner.email } }))

/* ── Institutes ── */

const tenantStats = (tenant) => runWithTenant(tenantCtx(tenant), async () => {
  const [students, staff, users, last] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    Staff.countDocuments({}),
    User.countDocuments({ role: { $nin: ['student', 'parent'] } }),
    ActivityLog.findOne({}, 'createdAt').sort({ createdAt: -1 }).lean(),
  ])
  return { students, staff, users, lastActivityAt: last?.createdAt || null }
})

const urlsOf = (t) => {
  const scheme = platform.domain === 'localhost' ? 'http' : 'https'
  const port = platform.domain === 'localhost' ? `:${config.isProduction ? config.port : 5388}` : ''
  return [
    ...(t.isMain ? [`${scheme}://${platform.hosts.find((h) => h !== '127.0.0.1') || 'localhost'}${port}`] : []),
    `${scheme}://${t.code}.${platform.domain}${port}`,
    ...t.domains.map((d) => `https://${d}`),
  ]
}

router.get('/overview', asyncHandler(async (req, res) => {
  const tenants = await Tenant.find().sort({ isMain: -1, name: 1 }).lean()
  const installs = await Installation.aggregate([{ $match: LISTED }, { $group: { _id: '$tenant', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, lastSeenAt: { $max: '$lastSeenAt' } } }])
  const byTenant = Object.fromEntries(installs.map((i) => [String(i._id), i]))
  const rows = await Promise.all(tenants.map(async (t) => ({
    ...t,
    urls: urlsOf(t),
    stats: await tenantStats(t).catch(() => null),
    installations: byTenant[String(t._id)] || { total: 0, active: 0 },
    block: tenantBlock(t)?.message || null,
  })))
  res.json({ tenants: rows, platform: platformInfo() })
}))

const platformInfo = () => ({
  domain: platform.domain,
  cnameTarget: platform.cnameTarget,
  serverIp: platform.serverIp,
  publicUrl: platform.publicUrl,
  installer: (() => {
    const file = installerFile()
    return file ? { name: path.basename(file), size: fs.statSync(file).size, builtAt: fs.statSync(file).mtime } : null
  })(),
  modules: ALL_MODULES,
})

const DOMAIN_RX = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

async function cleanDomains(list, tenantId) {
  const domains = [...new Set((Array.isArray(list) ? list : String(list || '').split(/[\s,]+/))
    .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean))]
  for (const d of domains) {
    if (!DOMAIN_RX.test(d)) throw httpError(422, `"${d}" is not a valid domain name.`)
    if (platform.hosts.includes(d) || d.endsWith(`.${platform.domain}`)) throw httpError(422, `${d} belongs to the platform itself.`)
    const other = await Tenant.findOne({ domains: d, _id: { $ne: tenantId } }, 'name').lean()
    if (other) throw httpError(409, `${d} is already used by ${other.name}.`)
  }
  return domains
}

function tenantFields(body) {
  const data = pick(body, ['name', 'status', 'notes', 'offlineGraceDays', 'maxInstallations'])
  if ('expiresAt' in body) data.expiresAt = body.expiresAt ? new Date(`${String(body.expiresAt).slice(0, 10)}T23:59:59`) : null
  if (body.contact) data.contact = pick(body.contact, ['name', 'phone', 'email'])
  if ('modules' in body) data.modules = cleanModules(body.modules)
  for (const k of ['offlineGraceDays', 'maxInstallations']) if (k in data) data[k] = data[k] === '' || data[k] == null ? null : Number(data[k])
  return data
}

router.post('/tenants', asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(code)) throw httpError(422, 'Code: 2-31 lowercase letters, digits or dashes (used in the web address).')
  if (await Tenant.exists({ code })) throw httpError(409, `The code "${code}" is already taken.`)
  const admin = { name: String(req.body.adminName || 'Super Admin').trim(), email: String(req.body.adminEmail || '').trim().toLowerCase(), password: String(req.body.adminPassword || '') }
  if (!/^\S+@\S+\.\S+$/.test(admin.email)) throw httpError(422, 'Enter the email the institute owner will log in with.')
  if (admin.password.length < 6) throw httpError(422, 'The admin password must be at least 6 characters.')
  const dbName = `sc_${code.replace(/-/g, '_')}`
  if (await runWithTenant({ code, dbName }, () => User.exists({}))) throw httpError(409, `A database named ${dbName} already has data.`)

  const tenant = await Tenant.create({
    ...tenantFields(req.body), code, dbName, name: String(req.body.name || '').trim(),
    domains: await cleanDomains(req.body.domains),
  })
  try {
    await initTenant(tenant, { admin, demo: Boolean(req.body.demo), instituteName: tenant.name })
  } catch (error) {
    await Tenant.deleteOne({ _id: tenant._id })
    throw error
  }
  clearTenantCache()
  res.status(201).json(tenant)
}))

router.get('/tenants/:id', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean()
  if (!tenant) throw httpError(404, 'Institute not found.')
  const installations = await Installation.find({ tenant: tenant._id, ...LISTED }).sort({ createdAt: -1 }).lean()
  const superAdmins = await runWithTenant(tenantCtx(tenant), () => User.find({ role: 'superadmin' }, 'name loginId lastLoginAt active').lean())
  res.json({
    tenant: { ...tenant, urls: urlsOf(tenant), block: tenantBlock(tenant)?.message || null },
    stats: await tenantStats(tenant).catch(() => null),
    superAdmins,
    installations: installations.map((i) => installationView(tenant, i)),
    platform: platformInfo(),
  })
}))

router.put('/tenants/:id', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id)
  if (!tenant) throw httpError(404, 'Institute not found.')
  const data = tenantFields(req.body)
  if ('domains' in req.body) data.domains = await cleanDomains(req.body.domains, tenant._id)
  if (tenant.isMain && data.status === 'suspended') throw httpError(422, 'The main institute cannot be suspended.')
  tenant.set(data)
  await tenant.save()
  clearTenantCache()
  res.json(tenant)
}))

// Resets (or creates) the institute's super admin login.
router.post('/tenants/:id/admin-password', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean()
  if (!tenant) throw httpError(404, 'Institute not found.')
  const password = String(req.body.password || '')
  if (password.length < 6) throw httpError(422, 'The password must be at least 6 characters.')
  const result = await runWithTenant(tenantCtx(tenant), async () => {
    const user = await User.findOne({ role: 'superadmin' }).sort({ createdAt: 1 })
    if (!user) throw httpError(404, 'This institute has no super admin.')
    user.passwordHash = await bcrypt.hash(password, 10)
    user.active = true
    await user.save()
    return { loginId: user.loginId }
  })
  res.json(result)
}))

// Is each custom domain pointing at this server?
router.get('/tenants/:id/dns', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean()
  if (!tenant) throw httpError(404, 'Institute not found.')
  const targetIps = new Set(platform.serverIp ? platform.serverIp.split(',').map((s) => s.trim()) : [])
  if (platform.cnameTarget) for (const ip of await dns.resolve4(platform.cnameTarget).catch(() => [])) targetIps.add(ip)
  const results = await Promise.all(tenant.domains.map(async (domain) => {
    const [cname, a] = await Promise.all([dns.resolveCname(domain).catch(() => []), dns.resolve4(domain).catch(() => [])])
    const viaCname = platform.cnameTarget && cname.some((c) => c.toLowerCase().replace(/\.$/, '') === platform.cnameTarget)
    const viaA = a.some((ip) => targetIps.has(ip))
    return { domain, cname, a, ok: Boolean(viaCname || viaA), how: viaCname ? 'CNAME' : viaA ? 'A record' : null }
  }))
  res.json({ results, target: { cname: platform.cnameTarget, ips: [...targetIps] } })
}))

/* ── Desktop installations ── */

router.post('/tenants/:id/installations', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean()
  if (!tenant) throw httpError(404, 'Institute not found.')
  res.status(201).json(await createInstallation(tenant, req.body))
}))

router.put('/installations/:id', asyncHandler(async (req, res) => {
  const inst = await Installation.findOne({ _id: req.params.id, ...LISTED })
  if (!inst) throw httpError(404, 'Installation not found.')
  res.json(await changeInstallation(await Tenant.findById(inst.tenant).lean(), inst, req.body))
}))

router.post('/installations/:id/renew', asyncHandler(async (req, res) => {
  const inst = await Installation.findOne({ _id: req.params.id, ...LISTED })
  if (!inst) throw httpError(404, 'Installation not found.')
  res.json(await renewInstallation(inst))
}))

router.delete('/installations/:id', asyncHandler(async (req, res) => {
  const inst = await deleteInstallation({ _id: req.params.id })
  if (!inst) throw httpError(404, 'Installation not found.')
  res.json(inst)
}))

router.post('/installations/:id/reset-device', asyncHandler(async (req, res) => {
  const inst = await resetInstallationDevice({ _id: req.params.id })
  if (!inst) throw httpError(404, 'Installation not found.')
  res.json(inst)
}))

export default router
