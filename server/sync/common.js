// Shared by both ends of desktop sync. Records travel as EJSON so ObjectIds and dates
// survive. Conflicts are settled per record: the newer updatedAt wins; a delete wins
// over edits made before it.
import mongoose from 'mongoose'
import { modelOf, tenantConnection } from '../tenancy.js'

export const { EJSON } = mongoose.mongo.BSON
export const toEJSON = (value) => EJSON.stringify(value, { relaxed: false })
export const fromEJSON = (text) => EJSON.parse(text, { relaxed: false })

const time = (d) => (d ? new Date(d).getTime() : 0)

// Up to `limit` records of `Model` changed after `cursor` ({ t, id }), oldest first.
export async function changesAfter(Model, cursor, limit, field = 'updatedAt') {
  const filter = cursor?.t
    ? { $or: [{ [field]: { $gt: new Date(cursor.t) } }, { [field]: new Date(cursor.t), _id: { $gt: new mongoose.Types.ObjectId(cursor.id) } }] }
    : {}
  const docs = await Model.collection.find(filter).sort({ [field]: 1, _id: 1 }).limit(limit).toArray()
  const last = docs.at(-1)
  return { docs, cursor: last ? { t: new Date(last[field] || 0).toISOString(), id: String(last._id) } : cursor || null }
}

// Writes incoming records where they are newer than ours (and not deleted later here).
// `check(doc, existing)` may return a reason to refuse a record.
export async function applyDocs(name, docs, { check } = {}) {
  const out = { applied: 0, skipped: 0, conflicts: [] }
  if (!docs?.length) return out
  const conn = tenantConnection()
  const Model = modelOf(name, conn)
  const ids = docs.map((d) => d._id)
  const [existing, tombs] = await Promise.all([
    Model.collection.find({ _id: { $in: ids } }).toArray(),
    modelOf('SyncTombstone', conn).collection.find({ model: name, docId: { $in: ids } }).toArray(),
  ])
  const current = new Map(existing.map((d) => [String(d._id), d]))
  const deletedAt = new Map(tombs.map((t) => [String(t.docId), time(t.deletedAt)]))
  const ops = []
  const opDocs = []
  for (const doc of docs) {
    const have = current.get(String(doc._id))
    if (have && time(have.updatedAt) >= time(doc.updatedAt)) { out.skipped++; continue }
    if (!have && deletedAt.get(String(doc._id)) >= time(doc.updatedAt)) { out.skipped++; continue }
    const refusal = await check?.(doc, have)
    if (refusal) { out.conflicts.push({ model: name, id: String(doc._id), reason: refusal }); continue }
    ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })
    opDocs.push(doc)
  }
  if (!ops.length) return out
  try {
    await Model.collection.bulkWrite(ops, { ordered: false })
    out.applied += ops.length
  } catch (error) {
    const writeErrors = error.writeErrors ? [].concat(error.writeErrors) : null
    if (!writeErrors) throw error
    out.applied += ops.length - writeErrors.length
    for (const e of writeErrors) {
      const doc = opDocs[e.index]
      const message = e.errmsg || e.err?.errmsg || e.message || 'write failed'
      out.conflicts.push({ model: name, id: String(doc?._id), reason: e.code === 11000 ? `Duplicate value: ${message.replace(/^.*dup key: /, '')}` : message })
    }
  }
  return out
}

// Deletes records whose tombstone is newer than our last edit, and keeps the tombstone.
export async function applyTombstones(tombstones, allowed) {
  const conn = tenantConnection()
  let deleted = 0
  for (const t of tombstones || []) {
    if (!allowed.includes(t.model)) continue
    const Model = modelOf(t.model, conn)
    const have = await Model.collection.findOne({ _id: t.docId }, { projection: { updatedAt: 1 } })
    if (have && time(have.updatedAt) > time(t.deletedAt)) continue
    if (have) deleted += (await Model.collection.deleteOne({ _id: t.docId })).deletedCount
    await modelOf('SyncTombstone', conn).collection.updateOne(
      { model: t.model, docId: t.docId },
      { $max: { deletedAt: new Date(t.deletedAt) } },
      { upsert: true },
    )
  }
  return deleted
}
