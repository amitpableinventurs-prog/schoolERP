import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const env = (key, fallback = '') => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

const isProduction = env('NODE_ENV') === 'production'
// central = the server you host (all clients, owner console); desktop = inside the Windows app.
const mode = env('SC_MODE', 'central') === 'desktop' ? 'desktop' : 'central'
const port = Number(env('PORT', 5188))
const root = path.resolve(here, '..')
const mongoUri = env('MONGODB_URI', 'mongodb://127.0.0.1:27017/smart_campus_erp')
const platformDomain = env('PLATFORM_DOMAIN', 'localhost').toLowerCase()

export const config = {
  isProduction,
  mode,
  port,
  // The desktop app only listens on 127.0.0.1.
  host: env('HOST') || undefined,

  paths: {
    root,
    dist: path.resolve(here, '../dist'),
  },

  mongoUri,
  // Database named in MONGODB_URI: the "main" institute's data.
  defaultDb: mongoUri.replace(/^mongodb(\+srv)?:\/\/[^/]+/, '').match(/^\/([^?]+)/)?.[1] || 'test',

  // Central server: client institutes, their domains, modules and desktop licences.
  platform: {
    db: env('PLATFORM_DB', 'smart_campus_platform'),
    // Every client also gets <code>.<PLATFORM_DOMAIN>.
    domain: platformDomain,
    // Hosts that serve the owner console (and the main institute).
    hosts: env('PLATFORM_HOSTS', `localhost,127.0.0.1,${platformDomain},www.${platformDomain},app.${platformDomain}`).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    // What a client's custom domain should point to (DNS check + instructions).
    cnameTarget: env('PLATFORM_CNAME_TARGET', platformDomain === 'localhost' ? '' : `app.${platformDomain}`).toLowerCase(),
    serverIp: env('SERVER_IP'),
    // Address the desktop apps talk to.
    publicUrl: env('PLATFORM_URL', `http://localhost:${port}`).replace(/\/$/, ''),
    owner: { name: env('OWNER_NAME', 'Platform Owner'), email: env('OWNER_EMAIL').toLowerCase(), password: env('OWNER_PASSWORD') },
    keyDir: path.resolve(root, env('LICENSE_KEY_DIR', 'keys')),
    installerDir: path.resolve(root, env('INSTALLER_DIR', 'desktop/release')),
    // A desktop app keeps working this many days without reaching the server.
    offlineGraceDays: Number(env('OFFLINE_GRACE_DAYS', 15)),
  },

  // Desktop app (set by the Electron shell).
  desktop: mode === 'desktop' ? {
    centralUrl: env('CENTRAL_URL').replace(/\/$/, ''),
    dataDir: env('SC_DATA_DIR', path.resolve(root, '.desktop-data')),
    publicKeyFile: env('LICENSE_PUBLIC_KEY_FILE', path.resolve(root, 'license-public.pem')),
    syncSeconds: Number(env('SYNC_SECONDS', 60)),
  } : null,

  auth: {
    jwtSecret: env('JWT_SECRET'),
    cookieName: 'sc_session',
    sessionDays: 7,
    initialAdmin: {
      name: env('ADMIN_NAME', 'Administrator'),
      email: env('ADMIN_EMAIL', 'admin@campus.local'),
      password: env('ADMIN_PASSWORD'),
    },
  },

  // AI_PROVIDER picks anthropic / openai / gemini. Unset = the first one with a key.
  ai: (() => {
    const keys = {
      anthropic: env('ANTHROPIC_API_KEY') || env('ANTHROPIC_AUTH_TOKEN'),
      openai: env('OPENAI_API_KEY'),
      gemini: env('GEMINI_API_KEY'),
    }
    const models = {
      anthropic: env('AI_MODEL', 'claude-opus-5-5'),
      openai: env('OPENAI_MODEL', 'gpt-4o-mini'),
      gemini: env('GEMINI_MODEL', 'gemini-3.8-flash'),
    }
    // Used when the main model is overloaded or out of quota.
    const fallbacks = { openai: env('OPENAI_FALLBACK_MODEL'), gemini: env('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash') }
    const asked = env('AI_PROVIDER').toLowerCase()
    const provider = asked in keys ? asked : Object.keys(keys).find((p) => keys[p]) || 'anthropic'
    // The Anthropic SDK reads ANTHROPIC_API_KEY itself; the others get their key passed in.
    return { provider, enabled: Boolean(keys[provider]), apiKey: keys[provider], model: models[provider], fallbackModel: fallbacks[provider], keyVar: { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }[provider] }
  })(),

  // Automation rules are checked on this interval and run once a day after their configured hour.
  automationTickMinutes: Number(env('AUTOMATION_TICK_MINUTES', 15)),
}

if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set in .env and be at least 32 characters long.')
}
