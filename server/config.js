import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const env = (key, fallback = '') => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

const isProduction = env('NODE_ENV') === 'production'

export const config = {
  isProduction,
  port: Number(env('PORT', 5188)),

  paths: {
    root: path.resolve(here, '..'),
    dist: path.resolve(here, '../dist'),
  },

  mongoUri: env('MONGODB_URI', 'mongodb://127.0.0.1:27017/smart_campus_erp'),

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
