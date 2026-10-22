// Central side of desktop sync (/api/sync). Each request carries the installation's
// signed licence; it decides the institute (database) and which collections the
// installation may download and change.
import express, { Router } from 'express'
import { ActivityLog } from '../models.js'
import { verifyLicense } from '../license.js'
import { modelOf, runWithTenant } from '../tenancy.js'
import { asyncHandler } from '../util.js'
import { collectionsFor } from '../../shared/modules.js'
import { effectiveModules, Installation, issueLicense, keyExpired, keyExpiredMessage, Tenant, tenantBlock, tenantCtx } from '../platform/store.js'
import { applyDocs, applyTombstones, changesAfter, fromEJSON, toEJSON } from './common.js'

const router = Router()
router.use(express.text({ type: () => true, limit: '50mb' }))

const sendEJSON = (res, status, body) => res.status(status).type('application/json').send(toEJSON(body))

router.use(asyncHandler(async (req, res, next) => {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const payload = verifyLicense(token)
  if (!payload) return sendEJSON(res, 401, { error: 'This licence is not valid for this server. Please activate the app again.', code: 'invalid' })
  const inst = await Installation.findById(payload.iid)
  if (!inst || inst.status === 'deleted') return sendEJSON(res, 403, { error: 'The key of this computer has been deleted by your super admin. Ask for a new key, then press Alt and choose App → Change activation key.', code: 'revoked' })
  if (keyExpired(inst)) return sendEJSON(res, 402, { error: keyExpiredMessage(inst), code: 'expired' })
  if (inst.status !== 'active') return sendEJSON(res, 403, { error: 'The key of this computer has been deactivated by your super admin. The app opens again by itself once the key is activated.', code: 'revoked' })
  if (!inst.machineId || inst.machineId !== req.get('x-machine-id')) {
    return sendEJSON(res, 403, { error: 'This activation key now belongs to another computer. Please activate the app again.', code: 'moved' })
  }
  const tenant = await Tenant.findById(inst.tenant).lean()
  const block = tenantBlock(tenant)
  if (block) return sendEJSON(res, block.status, { error: block.message, code: 'blocked' })
  req.installation = inst
  req.tenantDoc = tenant
  req.collections = collectionsFor(effectiveModules(tenant, inst))
  req.payload = req.body ? fromEJSON(req.body) : {}
  inst.lastSeenAt = new Date()
  inst.appVersion = String(req.get('x-app-version') || inst.appVersion || '').slice(0, 20)
  runWithTenant(tenantCtx(tenant), next)
}))

const remember = async (inst, conflicts) => {
  if (conflicts.length) inst.sync.conflicts = [...conflicts.map((c) => ({ ...c, at: new Date() })), ...inst.sync.conflicts].slice(0, 30)
  await inst.save()
}

// Records changed after the client's cursors, a page at a time.
router.post('/pull', asyncHandler(async (req, res) => {
  const { cursors = {}, limit: asked } = req.payload
  const limit = Math.min(1000, Number(asked) || 300)
  const docs = {}
  const next = {}
  let more = false
  for (const name of req.collections) {
    const page = await changesAfter(modelOf(name), cursors[name], limit)
    if (page.docs.length) docs[name] = page.docs
    next[name] = page.cursor
    if (page.docs.length === limit) more = true
  }
  const tombs = await changesAfter(modelOf('SyncTombstone'), cursors.__tombstones, limit, 'deletedAt')
  next.__tombstones = tombs.cursor
  if (tombs.docs.length === limit) more = true
  req.installation.sync.lastPullAt = new Date()
  await remember(req.installation, [])
  sendEJSON(res, 200, {
    docs,
    tombstones: tombs.docs.filter((t) => req.collections.includes(t.model)).map(({ model, docId, deletedAt }) => ({ model, docId, deletedAt })),
    cursors: next,
    more,
    license: issueLicense(req.tenantDoc, req.installation),
  })
}))

// Admin logins are only created or promoted online, so a desktop cannot raise anyone's rights.
const ADMIN_ROLES = ['superadmin', 'admin']
function checkFor(name) {
  const Model = modelOf(name)
  return async (doc, have) => {
    if (name === 'User' && (ADMIN_ROLES.includes(doc.role) || ADMIN_ROLES.includes(have?.role)) && doc.role !== have?.role) {
      return 'Admin logins can only be created or changed online.'
    }
    try {
      await new Model(doc).validate()
      return null
    } catch (invalid) {
      return invalid.message
    }
  }
}

// Changes made on the desktop.
router.post('/push', asyncHandler(async (req, res) => {
  const { docs = {}, tombstones = [], activity = [] } = req.payload
  const result = { applied: 0, skipped: 0, deleted: 0, conflicts: [] }
  for (const [name, list] of Object.entries(docs)) {
    if (!req.collections.includes(name)) {
      result.conflicts.push({ model: name, reason: 'This installation does not have the module for these records.' })
      continue
    }
    const r = await applyDocs(name, list, { check: checkFor(name) })
    result.applied += r.applied
    result.skipped += r.skipped
    result.conflicts.push(...r.conflicts)
  }
  result.deleted = await applyTombstones(tombstones, req.collections)
  if (activity.length) {
    await ActivityLog.collection.bulkWrite(activity.slice(0, 2000).map((a) => ({
      updateOne: { filter: { _id: a._id }, update: { $setOnInsert: { ...a, summary: `${a.summary || ''} [desktop: ${req.installation.label}]` } }, upsert: true },
    })), { ordered: false })
  }
  const { sync } = req.installation
  sync.lastPushAt = new Date()
  sync.pushed = (sync.pushed || 0) + result.applied + result.deleted
  await remember(req.installation, result.conflicts)
  sendEJSON(res, 200, { ...result, license: issueLicense(req.tenantDoc, req.installation) })
}))

export default router
