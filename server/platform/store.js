// The platform's own records (central server only): client institutes ("tenants")
// and their desktop installations. Stored in a separate database (PLATFORM_DB).
import mongoose from 'mongoose'
import { config } from '../config.js'
import { fixedModel } from '../tenancy.js'
import { ALL_MODULES, moduleLabel } from '../../shared/modules.js'
import { newActivationKey, signLicense } from '../license.js'
import { httpError } from '../util.js'

const { Schema } = mongoose
const db = config.platform.db

export const Tenant = fixedModel(db, 'Tenant', new Schema({
  code: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9][a-z0-9-]{1,30}$/, 'Code: 2-31 letters, digits or dashes.'] },
  name: { type: String, required: true, trim: true },
  dbName: { type: String, required: true, unique: true },
  // Custom domains of the client (erp.client.com). <code>.<PLATFORM_DOMAIN> always works too.
  domains: { type: [{ type: String, lowercase: true, trim: true }], default: [] },
  modules: { type: [{ type: String, enum: ALL_MODULES }], default: () => [...ALL_MODULES] },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  expiresAt: Date, // subscription end; empty = no end date
  offlineGraceDays: Number, // empty = OFFLINE_GRACE_DAYS
  maxInstallations: Number,
  contact: { name: String, phone: String, email: String },
  notes: String,
  isMain: Boolean, // the institute in MONGODB_URI, served on the platform's own hosts
}, { timestamps: true }).index({ domains: 1 }))

export const KEY_PLANS = ['none', 'monthly', 'yearly', 'custom']
const PLAN_MONTHS = { monthly: 1, yearly: 12 }

export const Installation = fixedModel(db, 'Installation', new Schema({
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  key: { type: String, required: true, unique: true },
  label: { type: String, required: true, trim: true }, // "Accounts PC", "Principal laptop"
  deviceCode: { type: String, required: true }, // D1, D2… keeps offline receipt numbers apart
  modules: { type: [{ type: String, enum: ALL_MODULES }], default: undefined }, // empty = all of the institute's
  // deleted = gone from the lists; kept so its key and device code are never reused.
  status: { type: String, enum: ['active', 'revoked', 'deleted'], default: 'active' },
  deletedAt: Date,
  // Validity of the key: monthly / yearly are renewed with one click; custom = a chosen date.
  plan: { type: String, enum: KEY_PLANS, default: 'none' },
  expiresAt: Date, // empty = no end date
  machineId: String, // bound on first activation
  deviceName: String,
  appVersion: String,
  activatedAt: Date,
  lastSeenAt: Date,
  sync: {
    lastPullAt: Date,
    lastPushAt: Date,
    pushed: { type: Number, default: 0 },
    conflicts: { type: [Schema.Types.Mixed], default: [] },
  },
}, { timestamps: true }).index({ tenant: 1, deviceCode: 1 }, { unique: true }))

export const tenantCtx = (tenant) => ({ code: tenant.code, dbName: tenant.dbName })

// Modules an installation may use: its own list, limited to what the institute has.
export function effectiveModules(tenant, installation) {
  const own = tenant.modules || ALL_MODULES
  return installation?.modules?.length ? installation.modules.filter((m) => own.includes(m)) : [...own]
}

// Why a tenant cannot be used right now, or null.
export function tenantBlock(tenant) {
  if (!tenant) return { status: 404, message: 'No institute is set up at this address.' }
  if (tenant.status !== 'active') return { status: 423, message: `${tenant.name}: this account is suspended. Please contact your service provider.` }
  if (tenant.expiresAt && new Date(tenant.expiresAt) < new Date()) return { status: 402, message: `${tenant.name}: the subscription ended on ${new Date(tenant.expiresAt).toDateString()}. Please contact your service provider to renew.` }
  return null
}

export const moduleNames = (mods) => mods.map(moduleLabel).join(', ')

/* ── Host → tenant ── */

const cache = new Map() // host → { tenant, until }
export const clearTenantCache = () => cache.clear()

export async function tenantForHost(rawHost) {
  const host = String(rawHost || '').toLowerCase().replace(/\.$/, '')
  const hit = cache.get(host)
  if (hit && hit.until > Date.now()) return hit.tenant
  let tenant = null
  const { hosts, domain } = config.platform
  if (hosts.includes(host)) {
    tenant = await Tenant.findOne({ isMain: true }).lean()
  } else if (host.endsWith(`.${domain}`) && !host.slice(0, -domain.length - 1).includes('.')) {
    tenant = await Tenant.findOne({ code: host.slice(0, -domain.length - 1) }).lean()
  }
  if (!tenant) tenant = await Tenant.findOne({ domains: { $in: [host, host.replace(/^www\./, '')] } }).lean()
  if (cache.size > 2000) cache.clear()
  cache.set(host, { tenant, until: Date.now() + 30_000 })
  return tenant
}

// The institute in MONGODB_URI becomes the "main" tenant (keeps single-institute setups working).
export async function ensureMainTenant() {
  const main = await Tenant.findOne({ isMain: true })
  if (main) return main
  return Tenant.create({ code: 'main', name: 'Main institute', dbName: config.defaultDb, isMain: true, modules: [...ALL_MODULES] })
}

/* ── Licences ── */

// Valid offline for the grace days, never past the institute's or the key's end date.
export function issueLicense(tenant, installation) {
  const graceDays = tenant.offlineGraceDays ?? config.platform.offlineGraceDays
  let validUntil = Date.now() + graceDays * 86_400_000
  if (tenant.expiresAt) validUntil = Math.min(validUntil, new Date(tenant.expiresAt).getTime())
  if (installation.expiresAt) validUntil = Math.min(validUntil, new Date(installation.expiresAt).getTime())
  return signLicense({
    iid: String(installation._id),
    tid: tenant.code,
    tname: tenant.name,
    label: installation.label,
    dc: installation.deviceCode,
    mods: effectiveModules(tenant, installation),
    mid: installation.machineId,
    kexp: installation.expiresAt ? Math.floor(new Date(installation.expiresAt).getTime() / 1000) : undefined,
    exp: Math.floor(validUntil / 1000),
  })
}

// Next free device code (D1, D2…) of an institute.
export async function nextDeviceCode(tenantId) {
  const used = new Set((await Installation.find({ tenant: tenantId }, 'deviceCode').lean()).map((i) => i.deviceCode))
  let n = 1
  while (used.has(`D${n}`)) n++
  return `D${n}`
}

/* ── Installations (owner console and the institute's super admin) ── */

export const cleanModules = (list) => (Array.isArray(list) ? list.filter((m) => ALL_MODULES.includes(m)) : undefined)

export const installationView = (tenant, inst) => ({
  ...inst,
  effectiveModules: effectiveModules(tenant, inst),
  downloadUrl: `${config.platform.publicUrl}/api/platform/download/${inst.key}`,
})

const endOfDay = (d) => { const t = new Date(d); t.setHours(23, 59, 59, 999); return t }
const addMonths = (from, n) => { const t = new Date(from); t.setMonth(t.getMonth() + n); return endOfDay(t) }
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const keyExpired = (inst) => Boolean(inst?.expiresAt && new Date(inst.expiresAt) < new Date())
export const keyExpiredMessage = (inst) => `This activation key expired on ${fmtDay(inst.expiresAt)}. Ask your super admin to renew it - the app opens again by itself after that.`

// { plan, expiresAt } from a form. A monthly / yearly plan starts today when it is chosen.
function planFields(body, inst) {
  if (!('plan' in body) && !('expiresAt' in body)) return {}
  const plan = KEY_PLANS.includes(body.plan) ? body.plan : inst?.plan || 'none'
  if (plan === 'none') return { plan, expiresAt: null }
  if (plan === 'custom') {
    const day = body.expiresAt && new Date(`${String(body.expiresAt).slice(0, 10)}T00:00:00`)
    if (!day || Number.isNaN(day.getTime())) throw httpError(422, 'Choose the date this key expires.')
    return { plan, expiresAt: endOfDay(day) }
  }
  if (inst && inst.plan === plan && inst.expiresAt) return { plan } // same plan: keep the date (use Renew)
  return { plan, expiresAt: addMonths(new Date(), PLAN_MONTHS[plan]) }
}

// One more month / year, counted from the end date (or from today if it has passed).
export async function renewInstallation(inst) {
  const months = PLAN_MONTHS[inst.plan]
  if (!months) throw httpError(422, 'Only monthly and yearly keys are renewed with one click. Set a new date with Edit.')
  const from = inst.expiresAt && new Date(inst.expiresAt) > new Date() ? inst.expiresAt : new Date()
  inst.expiresAt = addMonths(from, months)
  return inst.save()
}

export async function createInstallation(tenant, body) {
  const label = String(body.label || '').trim()
  if (!label) throw httpError(422, 'Give the installation a name, e.g. "Accounts PC".')
  if (tenant.maxInstallations && await Installation.countDocuments({ tenant: tenant._id, status: 'active' }) >= tenant.maxInstallations) {
    throw httpError(422, `${tenant.name} already has ${tenant.maxInstallations} active installations (its limit).`)
  }
  const modules = cleanModules(body.modules)
  return Installation.create({
    tenant: tenant._id, label, key: newActivationKey(), deviceCode: await nextDeviceCode(tenant._id),
    modules: modules?.length ? modules : undefined,
    ...planFields({ plan: 'none', ...body }),
  })
}

// Name, modules and active / revoked. A revoked installation locks at its next sync.
export async function changeInstallation(tenant, inst, body) {
  if ('label' in body) inst.label = String(body.label || '').trim() || inst.label
  inst.set(planFields(body, inst))
  if ('modules' in body) {
    const modules = cleanModules(body.modules)
    inst.modules = modules?.length ? modules : undefined
  }
  if (['active', 'revoked'].includes(body.status) && body.status !== inst.status) {
    if (body.status === 'active' && tenant.maxInstallations
      && await Installation.countDocuments({ tenant: tenant._id, status: 'active' }) >= tenant.maxInstallations) {
      throw httpError(422, `${tenant.name} already has ${tenant.maxInstallations} active installations (its limit).`)
    }
    inst.status = body.status
  }
  return inst.save()
}

// Lets the key be activated on a different computer (the old one stops syncing).
export const resetInstallationDevice = (filter) => Installation.findOneAndUpdate({ ...filter, status: { $ne: 'deleted' } }, { $unset: { machineId: 1, deviceName: 1 } }, { returnDocument: 'after' })

// The computer using it locks at its next sync.
export const deleteInstallation = (filter) => Installation.findOneAndUpdate({ ...filter, status: { $ne: 'deleted' } }, { status: 'deleted', deletedAt: new Date() }, { returnDocument: 'after' })

export const LISTED = { status: { $ne: 'deleted' } }
