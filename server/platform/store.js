// The platform's own records (central server only): client institutes ("tenants")
// and their desktop installations. Stored in a separate database (PLATFORM_DB).
import mongoose from 'mongoose'
import { config } from '../config.js'
import { fixedModel } from '../tenancy.js'
import { ALL_MODULES, moduleLabel } from '../../shared/modules.js'
import { signLicense } from '../license.js'

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

export const Installation = fixedModel(db, 'Installation', new Schema({
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  key: { type: String, required: true, unique: true },
  label: { type: String, required: true, trim: true }, // "Accounts PC", "Principal laptop"
  deviceCode: { type: String, required: true }, // D1, D2… keeps offline receipt numbers apart
  modules: { type: [{ type: String, enum: ALL_MODULES }], default: undefined }, // empty = all of the institute's
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
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

export function issueLicense(tenant, installation) {
  const graceDays = tenant.offlineGraceDays ?? config.platform.offlineGraceDays
  let validUntil = Date.now() + graceDays * 86_400_000
  if (tenant.expiresAt) validUntil = Math.min(validUntil, new Date(tenant.expiresAt).getTime())
  return signLicense({
    iid: String(installation._id),
    tid: tenant.code,
    tname: tenant.name,
    label: installation.label,
    dc: installation.deviceCode,
    mods: effectiveModules(tenant, installation),
    mid: installation.machineId,
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
