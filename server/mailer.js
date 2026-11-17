// Outgoing email and the public address used in links the app sends out.
import { config } from './config.js'
import { currentTenant } from './tenancy.js'

export const mailEnabled = Boolean(config.mail.brevoKey && config.mail.from)

// Base URL for links in emails and shared messages. The main institute uses APP_URL
// (the live site), so a link never opens an old beta/test copy; other institutes use
// the address their request came in on (their own domain).
export function publicBase(req) {
  const tenant = currentTenant()
  if (config.appUrl && (!tenant || tenant.code === 'main')) return config.appUrl
  const proto = config.isProduction && config.mode !== 'desktop' ? 'https' : req.protocol
  return `${proto}://${req.get('host')}`
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Sends one email through Brevo's transactional API. Throws on failure.
export async function sendMail({ to, toName, subject, text, html }) {
  if (!mailEnabled) throw new Error('Email is not configured (BREVO_API_KEY / MAIL_FROM).')
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.mail.brevoKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: config.mail.from, name: config.mail.fromName },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject,
      textContent: text,
      htmlContent: html || `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Email could not be sent (${res.status}) ${detail.slice(0, 200)}`)
  }
}

export function resetEmail({ name, link, institute, minutes }) {
  const text = `Dear ${name},

We received a request to reset your ${institute} portal password.
Open this link to choose a new password (valid for ${minutes} minutes):

${link}

If you did not ask for this, you can ignore this email; your password stays the same.`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.5">
<p>Dear ${escapeHtml(name)},</p>
<p>We received a request to reset your <strong>${escapeHtml(institute)}</strong> portal password.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2a78d6;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Choose a new password</a></p>
<p style="font-size:13px;color:#666">The link works for ${minutes} minutes. If the button does not open, copy this address into your browser:<br>${escapeHtml(link)}</p>
<p style="font-size:13px;color:#666">If you did not ask for this, ignore this email; your password stays the same.</p>
</div>`
  return { subject: `${institute}: reset your password`, text, html }
}
