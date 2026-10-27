export const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

export const compactMoney = (n) => {
  const v = Number(n) || 0
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return `₹${v}`
}

export const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const fmtDate = (s) => {
  if (!s) return '—'
  const d = typeof s === 'string' && s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')

export const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const TYPE_LABEL = { school: 'School', college: 'College', coaching: 'Coaching' }

export const waLink = (phone, text) => {
  const digits = String(phone || '').replace(/\D/g, '')
  const number = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

// Turns a YouTube / Google Drive / video-file link into something the lesson player
// can show inline. Returns null for links that can only be opened in a new tab.
export function embedFor(url) {
  if (!url) return null
  let u
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  let id = null
  if (host === 'youtu.be') id = u.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
  }
  if (id && /^[\w-]{6,20}$/.test(id)) return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` }
  const drive = host === 'drive.google.com' && u.pathname.match(/^\/file\/d\/([\w-]+)/)
  if (drive) return { type: 'iframe', src: `https://drive.google.com/file/d/${drive[1]}/preview` }
  if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { type: 'video', src: url }
  return null
}

// One status label for an assignment from the student's point of view.
export function assignmentState(a) {
  const s = a.submission
  if (s?.status === 'graded') return { tone: 'good', label: `Graded ${s.marks}/${a.maxMarks}` }
  if (s?.status === 'returned') return { tone: 'bad', label: 'Redo requested' }
  if (s) return { tone: 'info', label: s.late ? 'Submitted late' : 'Submitted' }
  if (a.status === 'closed') return { tone: '', label: 'Closed' }
  if (a.overdue) return { tone: 'bad', label: 'Overdue' }
  return { tone: 'warn', label: 'Pending' }
}

// "just now", "5m ago", "3h ago", "2d ago", then a date.
export const timeAgo = (s) => {
  const mins = Math.round((Date.now() - new Date(s)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  if (mins < 43200) return `${Math.round(mins / 1440)}d ago`
  return fmtDate(s)
}

// Public page where anyone can check a certificate number.
export const verifyUrl = (serialNo) => `${window.location.origin}/verify/${encodeURIComponent(serialNo)}`

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`)
const threeDigits = (n) => [n >= 100 && `${ONES[Math.floor(n / 100)]} Hundred`, n % 100 && twoDigits(n % 100)].filter(Boolean).join(' ')

// Indian numbering: 12,34,567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven".
export function rupeesInWords(amount) {
  let n = Math.round(Number(amount) || 0)
  if (!n) return 'Rupees Zero Only'
  const parts = []
  for (const [size, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']]) {
    if (n >= size) {
      const q = Math.floor(n / size)
      parts.push(`${q >= 100 ? threeDigits(q) : twoDigits(q)} ${name}`)
      n %= size
    }
  }
  if (n) parts.push(threeDigits(n))
  return `Rupees ${parts.join(' ')} Only`
}

export const monthName = (m) => {
  if (!m) return '—'
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// <input type="datetime-local"> works in local time without a zone; the API stores ISO dates.
export const toLocalInput = (d) => {
  if (!d) return ''
  const x = new Date(d)
  return new Date(x.getTime() - x.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
export const fromLocalInput = (s) => (s ? new Date(s).toISOString() : null)

export const weekday = (date) => DAYS[((new Date(`${date}T00:00:00`).getDay() + 6) % 7) + 1]
export const timeRange = (p) => (p.start ? `${p.start}${p.end ? `–${p.end}` : ''}` : '—')
