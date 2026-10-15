import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { config } from './config.js'
import { Setting, User } from './models.js'
import { ensureRules } from './automation.js'
import { seedDemoData } from './seed.js'
import { ensureParentLogins, ensureStaffWings, ensureSuperAdmin } from './services.js'

export async function connectDatabase() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
}

// On an empty database: load demo data (SEED_DEMO=true, the default) or just create the admin.
export async function initDatabase() {
  await connectDatabase()
  if (!(await User.exists({}))) {
    const { initialAdmin } = config.auth
    if (!initialAdmin.password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create the first admin account.')
    if (process.env.SEED_DEMO !== 'false') {
      await seedDemoData(initialAdmin)
    } else {
      await Setting.create({})
      await User.create({ name: initialAdmin.name, loginId: initialAdmin.email, passwordHash: await bcrypt.hash(initialAdmin.password, 10), role: 'admin' })
      console.log(`[db] Created admin account ${initialAdmin.email}`)
    }
  }
  await ensureRules()
  await ensureParentLogins()
  await ensureSuperAdmin()
  await ensureStaffWings()
}
