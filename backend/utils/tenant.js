const db = require("../db");

function isValidSchemaName(v) {
  return typeof v === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(v);
}

function quoteIdent(ident) {
  return `"${String(ident).replaceAll('"', '""')}"`;
}

/**
 * Returns quoted schema identifier, e.g. `"salon_demo"`.
 * Prefers schema_name from JWT, falls back to lookup by tenantId.
 */
async function resolveTenantSchema(req) {
  const fromToken = req.user?.schema_name;
  if (fromToken && isValidSchemaName(fromToken)) {
    return quoteIdent(fromToken);
  }

  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new Error("Missing tenantId in token");
  }

  const { rows } = await db.query(
    "SELECT schema_name FROM public.tenants WHERE id = $1",
    [tenantId]
  );

  const schema = rows[0]?.schema_name;
  if (!schema || !isValidSchemaName(schema)) {
    throw new Error(`No valid schema_name for tenantId ${tenantId}`);
  }

  return quoteIdent(schema);
}

module.exports = { resolveTenantSchema };