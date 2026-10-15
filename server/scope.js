// Wing scoping. A user limited to some wings (school / college / coaching) only
// sees and changes records of batches of those wings. Every helper returns an
// empty filter for users who see the whole institute, so unscoped code paths
// behave exactly as before.
import { Batch, Student } from './models.js'
import { httpError } from './util.js'

// { all, wings, batchIds } — cached on the request.
export async function scopeOf(req) {
  if (req._scope) return req._scope
  const wings = req.user.role === 'superadmin' ? null : req.user.wings
  const batchIds = wings ? (await Batch.find({ type: { $in: wings } }, '_id').lean()).map((b) => b._id) : null
  req._scope = { all: !wings, wings, batchIds, ids: new Set((batchIds || []).map(String)) }
  return req._scope
}

export const batchInScope = (scope, batchId) => scope.all || (batchId != null && scope.ids.has(String(batchId._id || batchId)))

// Mongo filter limiting `field` to the user's batches.
export async function batchFilter(req, field = 'batch') {
  const scope = await scopeOf(req)
  return scope.all ? {} : { [field]: { $in: scope.batchIds } }
}

// Filter for an optional ?batch=… query: that batch (if allowed) or all allowed batches.
export async function batchQuery(req, requested, field = 'batch') {
  if (requested) {
    await assertBatch(req, requested)
    return { [field]: requested }
  }
  return batchFilter(req, field)
}

// For records whose batch is optional (empty = every batch, e.g. notices): scoped users
// can read their own and the shared ones, but only change their own.
export async function optionalBatchFilter(req, mode = 'read') {
  const scope = await scopeOf(req)
  if (scope.all) return {}
  return mode === 'read' ? { $or: [{ batch: { $in: scope.batchIds } }, { batch: null }] } : { batch: { $in: scope.batchIds } }
}

export async function assertBatch(req, batchId) {
  const scope = await scopeOf(req)
  if (!batchId || !batchInScope(scope, batchId)) throw httpError(404, 'Batch not found in your wing.')
}

export async function assertStudent(req, studentId) {
  const student = await Student.findById(studentId, 'batch').lean()
  if (!student || !batchInScope(await scopeOf(req), student.batch)) throw httpError(404, 'Student not found in your wing.')
  return student
}

// Ids of every student in scope (for collections without a batch field, like payments).
export async function studentFilter(req, field = 'student') {
  const scope = await scopeOf(req)
  if (scope.all) return {}
  const ids = await Student.distinct('_id', { batch: { $in: scope.batchIds } })
  return { [field]: { $in: ids } }
}

// Filter for things tagged with a wing (leads by type, outbox messages by wing).
export async function wingFilter(req, field) {
  const scope = await scopeOf(req)
  return scope.all ? {} : { [field]: { $in: scope.wings } }
}

export async function assertWing(req, wing) {
  const scope = await scopeOf(req)
  if (!scope.all && !scope.wings.includes(wing)) throw httpError(403, `You can only work in the ${scope.wings.join(' / ')} wing.`)
}

// Wings field of a record (staff, login): records with no wings belong to the whole
// institute, so only unscoped users see them.
export async function wingsListFilter(req) {
  const scope = await scopeOf(req)
  return scope.all ? {} : { wings: { $in: scope.wings } }
}

// When a scoped user edits a record's wings they can only add/remove their own wings;
// wings outside their scope are kept as they were.
export async function mergeWings(req, requested, previous = []) {
  const scope = await scopeOf(req)
  const asked = (Array.isArray(requested) ? requested : []).filter((w) => ['school', 'college', 'coaching'].includes(w))
  if (scope.all) return asked.length ? [...new Set(asked)] : undefined
  const mine = asked.filter((w) => scope.wings.includes(w))
  const others = (previous || []).filter((w) => !scope.wings.includes(w))
  const merged = [...new Set([...others, ...(mine.length || others.length ? mine : scope.wings)])]
  return merged
}
