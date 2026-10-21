// Central server: finds the institute of each API request from the address it was
// made to (erp.client.com, client.yourplatform.com, or the platform's own host for
// the main institute) and runs the rest of the request against its database.
import { runWithTenant } from '../tenancy.js'
import { asyncHandler } from '../util.js'
import { tenantBlock, tenantCtx, tenantForHost } from './store.js'

export const resolveTenant = asyncHandler(async (req, res, next) => {
  const tenant = await tenantForHost(req.hostname)
  const block = tenantBlock(tenant)
  if (block) return res.status(block.status).json({ error: tenant ? block.message : `No institute is set up at ${req.hostname}.`, locked: true })
  req.tenant = tenant
  req.modules = tenant.modules
  runWithTenant(tenantCtx(tenant), next)
})
