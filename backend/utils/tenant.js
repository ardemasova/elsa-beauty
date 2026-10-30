/**
 * Returns the quoted schema of the branch the request works in, e.g. `"b_1a2b..."`.
 *
 * The branch is resolved and access-checked by `authenticateToken`
 * (middleware/auth.js). Nothing from the request body/query or token payload
 * is trusted here.
 */
async function resolveTenantSchema(req) {
  if (!req.tenant?.schemaQuoted) {
    const err = new Error("No branch selected");
    err.status = 400;
    throw err;
  }
  return req.tenant.schemaQuoted;
}

module.exports = { resolveTenantSchema };
