import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { User } from './models.js'
import { currentTenant } from './tenancy.js'
import { hasModule, moduleForApiPath, moduleLabel } from '../shared/modules.js'

const { jwtSecret, cookieName, sessionDays } = config.auth

export function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user._id), tid: currentTenant()?.code, name: user.name, role: user.role, student: user.student ? String(user.student) : undefined },
    jwtSecret,
    { expiresIn: `${sessionDays}d` }
  )
  res.cookie(cookieName, token, {
    httpOnly: true,
    // Strict: the cookie is never sent on cross-site requests, which blocks CSRF.
    sameSite: 'strict',
    // The desktop app talks to its own server over plain http://127.0.0.1.
    secure: config.isProduction && config.mode !== 'desktop',
    path: '/api',
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(cookieName, { path: '/api' })
}

// Role, wings and active status are read from the database on every request, so a
// change made by the super admin (new wings, role, deactivation) applies at once.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[cookieName]
  if (!token) return res.status(401).json({ error: 'Please log in.' })
  let payload
  try {
    payload = jwt.verify(token, jwtSecret)
  } catch {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
  }
  // A session belongs to one institute.
  if ((payload.tid || 'main') !== (currentTenant()?.code || 'main')) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Please log in.' })
  }
  try {
    const user = await User.findById(payload.sub, 'name role wings student active').lean()
    if (!user?.active) {
      clearSessionCookie(res)
      return res.status(401).json({ error: 'Your account is disabled. Please contact the administrator.' })
    }
    req.user = { id: String(user._id), name: user.name, role: user.role, wings: user.wings?.length ? user.wings : null, student: user.student ? String(user.student) : undefined }
    next()
  } catch (error) {
    next(error)
  }
}

export const isAdmin = (user) => user?.role === 'admin' || user?.role === 'superadmin'

// Admins (and the super admin) can do everything in their wings; other roles only what is listed.
export const allow = (...roles) => (req, res, next) => {
  if (isAdmin(req.user) || roles.includes(req.user.role)) return next()
  res.status(403).json({ error: 'You do not have access to this section.' })
}

// Allocating admins, institute settings and the activity log.
export const superOnly = (req, res, next) => {
  if (req.user.role === 'superadmin') return next()
  res.status(403).json({ error: 'Only the super admin can do this.' })
}

export const STAFF_ROLES = ['teacher', 'accountant', 'counsellor']
export const staffOnly = allow(...STAFF_ROLES)

// Blocks API calls of modules the institute (or this desktop installation) does not have.
// req.modules is set by the tenant resolver (central) or the licence guard (desktop).
export function moduleGate(req, res, next) {
  const mod = moduleForApiPath(req.path)
  if (hasModule(req.modules, mod)) return next()
  res.status(403).json({ error: `The ${moduleLabel(mod)} module is not enabled for your institute. Please contact your service provider.` })
}
