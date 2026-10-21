// Desktop side of sync: every minute, send local changes to the central server, then
// download what changed there. Works offline - changes wait in the local database
// until the server can be reached again.
import { ActivityLog, SyncState, SyncTombstone } from '../models.js'
import { config } from '../config.js'
import { modelOf } from '../tenancy.js'
import { collectionsFor } from '../../shared/modules.js'
import { licensedModules, license, licenseToken, lockLicense, machineId, updateLicense } from '../desktop.js'
import { applyDocs, applyTombstones, changesAfter, fromEJSON, toEJSON } from './common.js'

const PAGE = 300
export const syncStatus = { online: false, syncing: false, initialized: false, lastSyncAt: null, lastError: null, conflicts: [], lastPushed: 0, lastPulled: 0 }

async function call(path, body) {
  const res = await fetch(`${config.desktop.centralUrl}/api/sync${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${licenseToken()}`,
      'X-Machine-Id': machineId() || '',
      'X-App-Version': process.env.SC_APP_VERSION || '',
    },
    body: toEJSON(body),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  let data = {}
  try { data = fromEJSON(text) } catch { /* not JSON (proxy error page) */ }
  if (!res.ok) {
    const error = new Error(data.error || `The server answered ${res.status}.`)
    error.status = res.status
    error.code = data.code
    throw error
  }
  if (data.license) updateLicense(data.license)
  return data
}

const state = async () => (await SyncState.findOneAndUpdate({ key: 'state' }, { $setOnInsert: { key: 'state' } }, { upsert: true, returnDocument: 'after' }).lean())

function noteConflicts(list) {
  if (!list?.length) return
  syncStatus.conflicts = [...list.map((c) => ({ ...c, at: new Date() })), ...syncStatus.conflicts].slice(0, 50)
}

async function push(since, names) {
  const mark = new Date()
  let pushed = 0
  const start = { t: since.toISOString(), id: '000000000000000000000000' }
  const sendAll = async (Model, field, wrap) => {
    let cursor = start
    for (;;) {
      const page = await changesAfter(Model, cursor, PAGE, field)
      if (!page.docs.length) break
      const result = await call('/push', wrap(page.docs))
      noteConflicts(result.conflicts)
      pushed += page.docs.length
      cursor = page.cursor
      if (page.docs.length < PAGE) break
    }
  }
  for (const name of names) await sendAll(modelOf(name), 'updatedAt', (docs) => ({ docs: { [name]: docs } }))
  await sendAll(SyncTombstone, 'deletedAt', (docs) => ({ tombstones: docs.filter((t) => names.includes(t.model)).map(({ model, docId, deletedAt }) => ({ model, docId, deletedAt })) }))
  await sendAll(ActivityLog, 'createdAt', (docs) => ({ activity: docs }))
  await SyncState.updateOne({ key: 'state' }, { pushedAt: mark })
  syncStatus.lastPushed = pushed
}

async function pull(current, names) {
  const startedAt = new Date()
  let cursors = current.cursors || {}
  let pulled = 0
  for (let page = 0; page < 10_000; page++) {
    const data = await call('/pull', { cursors, limit: PAGE })
    for (const [name, docs] of Object.entries(data.docs || {})) {
      if (!names.includes(name)) continue
      const result = await applyDocs(name, docs)
      pulled += result.applied
      noteConflicts(result.conflicts)
    }
    pulled += await applyTombstones(data.tombstones, names)
    cursors = data.cursors
    await SyncState.updateOne({ key: 'state' }, { cursors })
    if (!data.more) break
  }
  if (!current.initialized) {
    await SyncState.updateOne({ key: 'state' }, { initialized: true, pushedAt: startedAt })
    syncStatus.initialized = true
  }
  syncStatus.lastPulled = pulled
}

// A sync already running is awaited instead of starting a second one.
let running = null
export function syncNow() {
  running ||= syncOnce().finally(() => { running = null })
  return running
}

async function syncOnce() {
  if (!license()) return syncStatus
  syncStatus.syncing = true
  try {
    const current = await state()
    syncStatus.initialized = current.initialized
    const names = collectionsFor(licensedModules())
    if (current.initialized) await push(current.pushedAt || new Date(0), names)
    await pull(await state(), names)
    syncStatus.online = true
    syncStatus.lastError = null
    syncStatus.lastSyncAt = new Date()
    await SyncState.updateOne({ key: 'state' }, { lastSyncAt: syncStatus.lastSyncAt, conflicts: syncStatus.conflicts })
  } catch (error) {
    // No response at all = offline; keep working locally.
    syncStatus.online = Boolean(error.status)
    syncStatus.lastError = error.status ? error.message : 'Offline - changes are saved on this computer and will sync when the internet is back.'
    if ([401, 402, 403, 423].includes(error.status)) lockLicense(error.message)
  } finally {
    syncStatus.syncing = false
  }
  return syncStatus
}

export async function startSyncClient() {
  const current = await state()
  syncStatus.initialized = current.initialized
  syncStatus.lastSyncAt = current.lastSyncAt || null
  syncStatus.conflicts = current.conflicts || []
  const loop = async () => {
    await syncNow()
    // Until the first download is done, retry quickly.
    setTimeout(loop, (syncStatus.initialized ? config.desktop.syncSeconds : 10) * 1000)
  }
  loop()
}
