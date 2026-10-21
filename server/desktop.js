// Desktop app runtime (SC_MODE=desktop): the signed licence written by the Electron
// shell, the lock that applies when it is missing, revoked or too old, and the
// /api/desktop status routes the app's sync badge uses.
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { config } from './config.js'
import { verifyLicense } from './license.js'
import { requireAuth } from './auth.js'
import { syncNow, syncStatus } from './sync/client.js'

const licenseFile = () => path.join(config.desktop.dataDir, 'license.json')
let publicKey = null
let saved = {} // { token, machineId, revoked }
let payload = null

export function loadLicense() {
  publicKey ||= fs.readFileSync(config.desktop.publicKeyFile, 'utf8')
  try {
    saved = JSON.parse(fs.readFileSync(licenseFile(), 'utf8'))
  } catch {
    saved = {}
  }
  payload = verifyLicense(saved.token, publicKey)
  return payload
}

const persist = () => fs.writeFileSync(licenseFile(), JSON.stringify(saved, null, 2))

// A fresh token from the server (sent with every sync).
export function updateLicense(token) {
  const next = verifyLicense(token, publicKey)
  if (!next) return
  payload = next
  saved = { ...saved, token, revoked: undefined }
  persist()
}

export function lockLicense(message) {
  if (saved.revoked === message) return
  saved = { ...saved, revoked: message }
  persist()
}

export const license = () => payload
export const machineId = () => saved.machineId
export const licenseToken = () => saved.token
export const licensedModules = () => payload?.mods || []
// Offline receipt / admission / voucher numbers carry the device code (RCP-2026-D2-00001).
export const seriesTag = () => (config.desktop && payload?.dc ? `${payload.dc}-` : '')

export function licenseProblem() {
  if (!payload) return 'This app is not activated. Please restart it and enter your activation key.'
  if (saved.revoked) return saved.revoked
  if (payload.exp * 1000 < Date.now()) {
    return 'This computer has not reached the server for too long. Connect to the internet - the licence renews automatically within a minute.'
  }
  return null
}

// In front of every /api route of the desktop app.
export function desktopGuard(req, res, next) {
  const problem = licenseProblem()
  if (problem) return res.status(423).json({ error: problem, locked: true })
  if (!syncStatus.initialized) return res.status(503).json({ error: 'Preparing your data for first use. Please wait…', preparing: true })
  req.modules = licensedModules()
  next()
}

export const desktopRoutes = Router()

desktopRoutes.get('/status', (req, res) => {
  const lic = payload
  res.json({
    ...syncStatus,
    locked: licenseProblem(),
    centralUrl: config.desktop.centralUrl,
    license: lic && { institute: lic.tname, code: lic.tid, label: lic.label, deviceCode: lic.dc, modules: lic.mods, validUntil: new Date(lic.exp * 1000) },
  })
})

desktopRoutes.post('/sync', requireAuth, async (req, res) => {
  await syncNow()
  res.json(syncStatus)
})
