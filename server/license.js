// Desktop licences: the central server signs a small token (Ed25519) that says which
// institute, device and modules an installation may use and until when it may run
// without reaching the server. The desktop app only has the public key, so the token
// cannot be edited to unlock modules or extend the offline period.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

const b64 = (buf) => Buffer.from(buf).toString('base64url')

let privateKey = null
let publicKeyPem = null

// Central server: load the key pair, creating it on first start.
export function loadSigningKeys() {
  const dir = config.platform.keyDir
  const privFile = path.join(dir, 'license-private.pem')
  const pubFile = path.join(dir, 'license-public.pem')
  if (!fs.existsSync(privFile)) {
    fs.mkdirSync(dir, { recursive: true })
    const pair = crypto.generateKeyPairSync('ed25519')
    fs.writeFileSync(privFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
    fs.writeFileSync(pubFile, pair.publicKey.export({ type: 'spki', format: 'pem' }))
    console.log(`[license] Created a new licence key pair in ${dir} - back it up; desktop apps are built with its public key.`)
  }
  privateKey = crypto.createPrivateKey(fs.readFileSync(privFile))
  publicKeyPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' })
  if (!fs.existsSync(pubFile)) fs.writeFileSync(pubFile, publicKeyPem)
  return publicKeyPem
}

export const signingPublicKey = () => publicKeyPem

export function signLicense(payload) {
  if (!privateKey) loadSigningKeys()
  const body = b64(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }))
  return `${body}.${b64(crypto.sign(null, Buffer.from(body), privateKey))}`
}

// Returns the payload when the signature is valid (expiry is checked by the caller).
export function verifyLicense(token, publicKey = publicKeyPem) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig || !publicKey) return null
  try {
    const key = typeof publicKey === 'string' ? crypto.createPublicKey(publicKey) : publicKey
    if (!crypto.verify(null, Buffer.from(body), key, Buffer.from(sig, 'base64url'))) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

// Activation keys like SC-7KQ2-M9XD-4HTP (no 0/O/1/I to avoid typos).
export function newActivationKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(12)
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
  return `SC-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}
