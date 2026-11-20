#!/usr/bin/env node
/**
 * Sets a VAT rate on payments recorded without one.
 *
 *   npm run set-missing-vat -- --rate 21 --dry-run      # only count
 *   npm run set-missing-vat -- --rate 21                # all branches, customer payments
 *   npm run set-missing-vat -- --rate 21 --schema salon_demo --include-outgoing
 *
 * By default only payments FROM customers are changed: supplier payments
 * without VAT may really have none (e.g. rent from a private landlord).
 * Amounts do not change (they already include VAT); only the split into
 * "without VAT" and "VAT" in reports and invoices does.
 */
const { pool } = require("../db");
const { quoteIdent, isValidSchemaName } = require("../utils/sql");

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const flag = (n) => process.argv.includes(`--${n}`);

(async () => {
  const rate = Number(arg("rate"));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    console.error("Usage: npm run set-missing-vat -- --rate 21 [--schema name] [--include-outgoing] [--dry-run]");
    process.exit(1);
  }
  const only = arg("schema");
  if (only && !isValidSchemaName(only)) throw new Error("Invalid --schema");
  const dry = flag("dry-run");
  const typeFilter = flag("include-outgoing") ? "" : "AND type = 'incoming'";

  const { rows } = await pool.query(
    `SELECT name, schema_name FROM public.tenants ${only ? "WHERE schema_name = $1" : ""} ORDER BY created_at`,
    only ? [only] : []
  );
  if (!rows.length) console.log("No branches found.");

  let total = 0;
  for (const t of rows) {
    const s = quoteIdent(t.schema_name);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const c = await client.query(`SELECT count(*)::int AS n, COALESCE(sum(amount), 0) AS sum FROM ${s}.payments WHERE vat_percent IS NULL ${typeFilter}`);
      const n = c.rows[0].n;
      if (n && !dry) {
        // Old rows may break rules added later (e.g. method 'transfer');
        // lift those rules for this update and restore them unchanged.
        await client.query(`ALTER TABLE ${s}.payments DROP CONSTRAINT IF EXISTS payments_method_check`);
        await client.query(`UPDATE ${s}.payments SET vat_percent = $1 WHERE vat_percent IS NULL ${typeFilter}`, [rate]);
        await client.query(`ALTER TABLE ${s}.payments ADD CONSTRAINT payments_method_check CHECK (method IN ('Card', 'Cash')) NOT VALID`);
      }
      await client.query(dry ? "ROLLBACK" : "COMMIT");
      total += n;
      console.log(`${t.name} (${t.schema_name}): ${n} payment(s), ${Number(c.rows[0].sum).toFixed(2)} in total${n ? (dry ? " - would be set" : ` - set to ${rate}%`) : ""}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`❌ ${t.schema_name}: ${err.message}`);
      process.exitCode = 1;
    } finally {
      client.release();
    }
  }
  console.log(dry ? `Dry run: ${total} payment(s) would change.` : `✅ ${total} payment(s) updated.`);
  await pool.end();
})().catch(async (err) => {
  console.error("❌", err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
