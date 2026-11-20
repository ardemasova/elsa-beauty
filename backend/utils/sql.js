function isValidSchemaName(v) {
  return typeof v === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(v);
}

function quoteIdent(ident) {
  return `"${String(ident).replaceAll('"', '""')}"`;
}

module.exports = { isValidSchemaName, quoteIdent };
