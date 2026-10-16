// Small helpers shared by the routes.

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

// Dates are stored as local 'YYYY-MM-DD' strings so a day never shifts with time zones.
export function ymd(date = new Date()) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return ymd(d)
}

export function daysBetween(fromStr, toStr) {
  return Math.round((new Date(`${toStr}T00:00:00`) - new Date(`${fromStr}T00:00:00`)) / 86400000)
}

export function pick(source, keys) {
  const out = {}
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key]
  return out
}

export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function grade(percent) {
  if (percent >= 90) return 'A+'
  if (percent >= 80) return 'A'
  if (percent >= 70) return 'B+'
  if (percent >= 60) return 'B'
  if (percent >= 50) return 'C'
  if (percent >= 35) return 'D'
  return 'F'
}

export const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

// Fills {placeholders} in a message template.
export function fillTemplate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (values[key] ?? match))
}
