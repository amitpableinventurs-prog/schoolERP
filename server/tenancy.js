// Multi-tenancy: every client institute has its own MongoDB database on the central
// server. The tenant of a request lives in an AsyncLocalStorage, and every model
// exported by models.js is a proxy that resolves to that tenant's database, so route
// code (Student.find(...), new Payment(...), populate) works unchanged.
// Outside a tenant context (desktop app, CLI scripts) the default connection is used.
import { AsyncLocalStorage } from 'node:async_hooks'
import mongoose from 'mongoose'

const store = new AsyncLocalStorage()
const schemas = new Map()

// { code, dbName } of the current request, or null.
export const currentTenant = () => store.getStore() || null
export const runWithTenant = (tenant, fn) => store.run(tenant, fn)
// Keeps the current tenant for a callback that runs later (e.g. res.on('finish')).
export const bindTenant = (fn) => AsyncLocalStorage.bind(fn)

export const connectionFor = (dbName) => (dbName ? mongoose.connection.useDb(dbName, { useCache: true }) : mongoose.connection)
export const tenantConnection = () => connectionFor(currentTenant()?.dbName)

// The real mongoose model `name` on a connection. The first use compiles every model
// there, so populate() finds referenced models (Batch, Staff…) not used directly yet.
const compiled = new WeakSet()
export function modelOf(name, conn = tenantConnection()) {
  if (!compiled.has(conn)) {
    compiled.add(conn)
    for (const [other, schema] of schemas) if (!conn.models[other]) conn.model(other, schema)
  }
  return conn.models[name] || conn.model(name, schemas.get(name))
}
export const modelNames = () => [...schemas.keys()]

// A stand-in for a mongoose model that picks the real model on every use.
function modelProxy(name, resolve) {
  return new Proxy(function TenantModel() {}, {
    get(_, prop) {
      if (prop === 'modelName') return name
      const model = resolve()
      const value = Reflect.get(model, prop, model)
      return typeof value === 'function' && prop !== 'prototype' ? value.bind(model) : value
    },
    construct(_, args) {
      const Model = resolve()
      return new Model(...args)
    },
    has: (_, prop) => prop in resolve(),
  })
}

// A model stored in each tenant's own database.
export function defineModel(name, schema) {
  schemas.set(name, schema)
  return modelProxy(name, () => modelOf(name))
}

// A model that always lives in one fixed database (the platform's own records).
export function fixedModel(dbName, name, schema) {
  return modelProxy(name, () => {
    const conn = connectionFor(dbName)
    return conn.models[name] || conn.model(name, schema)
  })
}

// Compiles every model on a tenant database and (re)builds its indexes.
export async function ensureIndexes(conn = tenantConnection()) {
  await Promise.all(modelNames().map((name) => modelOf(name, conn).createIndexes()))
}
