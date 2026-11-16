import { Router } from 'express'
import { asyncHandler, escapeRegex, httpError, pick } from './util.js'

/**
 * Standard list/get/create/update/delete endpoints for a model.
 * - fields: which body keys may be written
 * - search: fields matched by ?q=
 * - filters: query params copied straight into the filter (e.g. ?batch=…&status=…)
 * - scope: async (req, 'read' | 'write') => extra filter limiting which records the user may touch
 */
export function crudRouter(Model, { fields, search = [], filters = [], populate = '', sort = { createdAt: -1 }, read, write, beforeSave, afterCreate, scope = async () => ({}), limit = 500, softDelete = false }) {
  const router = Router()

  router.get('/', read, asyncHandler(async (req, res) => {
    // $and keeps a query param (e.g. ?batch=…) from replacing the scope condition.
    const conditions = [await scope(req, 'read')]
    if (softDelete) conditions.push(req.query.archived === 'true' ? { deletedAt: { $ne: null } } : { deletedAt: null })
    for (const key of filters) if (req.query[key]) conditions.push({ [key]: String(req.query[key]) })
    if (req.query.q && search.length) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i')
      conditions.push({ $or: search.map((field) => ({ [field]: rx })) })
    }
    res.json(await Model.find({ $and: conditions }).populate(populate).sort(sort).limit(limit).lean())
  }))

  router.get('/:id', read, asyncHandler(async (req, res) => {
    const doc = await Model.findOne({ _id: req.params.id, ...(await scope(req, 'read')), ...(softDelete ? { deletedAt: null } : {}) }).populate(populate).lean()
    if (!doc) throw httpError(404, 'Not found.')
    res.json(doc)
  }))

  router.post('/', write, asyncHandler(async (req, res) => {
    const data = blankToNull(pick(req.body, fields))
    if (beforeSave) await beforeSave(data, req)
    const doc = await Model.create(data)
    if (afterCreate) await afterCreate(doc, req)
    res.status(201).json(doc)
  }))

  router.put('/:id', write, asyncHandler(async (req, res) => {
    const data = blankToNull(pick(req.body, fields))
    if (beforeSave) await beforeSave(data, req, req.params.id)
    const doc = await Model.findOneAndUpdate({ _id: req.params.id, ...(await scope(req, 'write')), ...(softDelete ? { deletedAt: null } : {}) }, data, { returnDocument: 'after', runValidators: true })
    if (!doc) throw httpError(404, 'Not found.')
    res.json(doc)
  }))

  if (softDelete) {
    router.post('/:id/restore', write, asyncHandler(async (req, res) => {
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, ...(await scope(req, 'write')), deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { returnDocument: 'after' },
      )
      if (!doc) throw httpError(404, 'Archived record not found.')
      res.json(doc)
    }))
  }

  router.delete('/:id', write, asyncHandler(async (req, res) => {
    if (softDelete) {
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, ...(await scope(req, 'write')), deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { returnDocument: 'after' },
      )
      if (!doc) throw httpError(404, 'Not found.')
      return res.json({ ok: true })
    }
    const doc = await Model.findOneAndDelete({ _id: req.params.id, ...(await scope(req, 'write')) })
    if (!doc) throw httpError(404, 'Not found.')
    res.json({ ok: true })
  }))

  return router
}

// Empty strings from forms become null so optional refs/enums don't fail validation
// (and an edit can clear a field).
export function blankToNull(data) {
  for (const [key, value] of Object.entries(data)) if (value === '') data[key] = null
  return data
}
