#!/usr/bin/env node
/**
 * Sets a VAT rate on payments recorded without one.
 *
 *   npm run set-missing-vat -- --rate 21 --dry-run      # only count
 *   npm run set-missing-vat -- --rate 21                # all branches, customer payments
 *   npm run set-missing-vat -- --rate 21 --schema salon_demo --include-outgoing --include-issued
 *
 * Payments that already carry an invoice number are issued documents: their
 * VAT must not change afterwards, so they are only listed and left as they are.
 * --include-issued changes them too; use it only on demo branches, or where
 * the invoices were never handed to customers.
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
    console.error("Usage: npm run set-missing-vat -- --rate 21 [--schema name] [--include-outgoing] [--include-issued] [--dry-run]");
    process.exit(1);
  }
  const only = arg("schema");
  if (only && !isValidSchemaName(only)) throw new Error("Invalid --schema");
  const dry = flag("dry-run");
  const typeFilter = flag("include-outgoing") ? "" : "AND type = 'incoming'";
  const issuedToo = flag("include-issued");
  const issuedFilter = issuedToo ? "" : "AND document_number IS NULL";

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
      const issued = await client.query(
        `SELECT document_number FROM ${s}.payments
          WHERE vat_percent IS NULL AND document_number IS NOT NULL ${typeFilter}
          ORDER BY paid_at, id`
      );
      const skipped = issuedToo ? 0 : issued.rows.length;
      const n = c.rows[0].n - skipped;
      if (n && !dry) {
        // Old rows may break rules added later (e.g. method 'transfer');
        // lift those rules for this update and restore them unchanged.
        await client.query(`ALTER TABLE ${s}.payments DROP CONSTRAINT IF EXISTS payments_method_check`);
        await client.query(`UPDATE ${s}.payments SET vat_percent = $1 WHERE vat_percent IS NULL ${typeFilter} ${issuedFilter}`, [rate]);
        await client.query(`ALTER TABLE ${s}.payments ADD CONSTRAINT payments_method_check CHECK (method IN ('Card', 'Cash')) NOT VALID`);
      }
      await client.query(dry ? "ROLLBACK" : "COMMIT");
      total += n;
      console.log(`${t.name} (${t.schema_name}): ${n} payment(s)${n ? (dry ? " - would be set" : ` - set to ${rate}%`) : ""}`);
      if (skipped) {
        const list = issued.rows.map((r) => r.document_number);
        console.log(`   ${skipped} issued invoice(s) without VAT left unchanged (add --include-issued to change them):`);
        console.log(`   ${list.slice(0, 20).join(", ")}${list.length > 20 ? `, ... and ${list.length - 20} more` : ""}`);
      }
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
