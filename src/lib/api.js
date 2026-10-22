const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// While the API restarts (e.g. after a code change in development) the proxy answers
// with a non-JSON 5xx. Reads and login are safe to repeat, so retry those briefly;
// other writes are never retried, to avoid saving something twice.
async function send(method, url, init) {
  const retryable = method === 'GET' || url === '/auth/login'
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(`/api${url}`, init)
    } catch (error) {
      if (!retryable || attempt >= 4) throw error
      await wait(1500)
      continue
    }
    const fromProxy = res.status >= 500 && !(res.headers.get('content-type') || '').includes('application/json')
    if (!fromProxy || !retryable || attempt >= 4) return res
    await wait(1500)
  }
}

// Thin fetch wrapper: JSON in/out, cookie session, readable errors.
async function request(method, url, body) {
  let res
  try {
    res = await send(method, url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the server. Check your connection and that the API is running.')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    // Non-JSON response (e.g. server down behind the dev proxy).
  }
  if (!res.ok) {
    const error = new Error(data?.error || (res.status >= 500 ? 'Server is not responding. Is the API running?' : `Request failed (${res.status})`))
    error.status = res.status
    error.locked = Boolean(data?.locked)
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'))
    // Desktop licence locked (or institute suspended): the whole app shows the lock screen.
    if (error.locked) window.dispatchEvent(new CustomEvent('app-locked', { detail: error.message }))
    throw error
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
}

export const qs = (params) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}
