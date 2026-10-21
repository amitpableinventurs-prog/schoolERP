import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { config } from './config.js'
import { Setting, User } from './models.js'
import { ensureRules } from './automation.js'
import { seedDemoData } from './seed.js'
import { ensureParentLogins, ensureStaffWings, ensureSuperAdmin } from './services.js'
import { modelOf, runWithTenant, tenantConnection } from './tenancy.js'
import { collectionsFor } from '../shared/modules.js'

export async function connectDatabase() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
}

// Prepares the current tenant's database. With `admin`, an empty database first gets
// demo data (demo: true) or just that super admin. Then the idempotent fix-ups run.
export async function initTenantData({ admin, demo = false, instituteName } = {}) {
  if (admin && !(await User.exists({}))) {
    if (!admin.password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create the first admin account.')
    if (demo) {
      await seedDemoData(admin)
      if (instituteName) await Setting.updateOne({}, { instituteName })
    } else {
      await Setting.create(instituteName ? { instituteName } : {})
      await User.create({ name: admin.name, loginId: admin.email.toLowerCase(), passwordHash: await bcrypt.hash(admin.password, 10), role: 'superadmin' })
      console.log(`[db] Created super admin ${admin.email}${instituteName ? ` for ${instituteName}` : ''}`)
    }
  }
  if (!(await User.exists({}))) return
  await ensureRules()
  await ensureParentLogins()
  await ensureSuperAdmin()
  await ensureStaffWings()
  await backfillUpdatedAt()
}

// Desktop sync reads changes by updatedAt, so every synced record needs one.
async function backfillUpdatedAt() {
  const settings = await Setting.findOne({}, 'migrations').lean()
  if (settings?.migrations?.includes('sync-updated-at')) return
  const conn = tenantConnection()
  for (const name of collectionsFor(null)) {
    await modelOf(name, conn).collection.updateMany({ updatedAt: { $exists: false } }, [{ $set: { updatedAt: { $ifNull: ['$createdAt', '$$NOW'] } } }])
  }
  await Setting.updateOne({}, { $addToSet: { migrations: 'sync-updated-at' } })
}

// Single-institute start (no platform): the database in MONGODB_URI.
export async function initDatabase() {
  await connectDatabase()
  await initTenantData({ admin: config.auth.initialAdmin, demo: process.env.SEED_DEMO !== 'false' })
}

export const initTenant = (tenant, options) => runWithTenant({ code: tenant.code, dbName: tenant.dbName }, () => initTenantData(options))
