#!/usr/bin/env node
/**
 * Demo set-up tools.
 *
 * 1) Freeze the demo data that every new demo sign-up receives:
 *
 *      npm run demo-template -- snapshot --from salon_demo
 *      npm run demo-template -- snapshot --from salon_demo --catalog-only
 *
 *    Copies the branch `--from` into the schema DEMO_TEMPLATE_SCHEMA
 *    (default "demo_template"), replacing a previous snapshot. The template is
 *    not a branch: nobody can log into it or change it through the app.
 *    --catalog-only copies services, items, expenses, VAT and settings but no
 *    clients/masters/appointments/payments.
 *
 * 2) Give every old demo user their own private demo (before this version all
 *    demo sign-ups shared one branch and saw each other's data):
 *
 *      npm run demo-template -- split-users --tenant salon_demo --keep you@elsaerp.com
 *
 *    Each active admin/master of that branch (except the --keep emails) gets a
 *    new demo account with a copy of the template and becomes its owner. Their
 *    login and password stay the same.
 */
const { pool } = require("../db");
const { migrateTenantSchema } = require("../migrations/runner");
const { cloneData, createTenant } = require("../services/provisioning");
const { quoteIdent, isValidSchemaName } = require("../utils/sql");

const TEMPLATE = process.env.DEMO_TEMPLATE_SCHEMA || "demo_template";
const CATALOG = ["settings", "services", "items", "expenses", "vat"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

async function snapshot() {
  const from = arg("from");
  if (!from || !isValidSchemaName(from)) throw new Error("--from <branch schema> is required");
  if (!isValidSchemaName(TEMPLATE)) throw new Error(`Invalid DEMO_TEMPLATE_SCHEMA: ${TEMPLATE}`);
  if (from === TEMPLATE) throw new Error("--from must be a different schema than the template");

  const live = await pool.query(`SELECT 1 FROM public.tenants WHERE schema_name = $1`, [TEMPLATE]);
  if (live.rows.length) throw new Error(`"${TEMPLATE}" is a live branch; choose another DEMO_TEMPLATE_SCHEMA`);

  const client = await pool.connect();
  try {
    await migrateTenantSchema(client, from, () => {});
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(TEMPLATE)} CASCADE`);
    await migrateTenantSchema(client, TEMPLATE, () => {});
    await client.query("BEGIN");
    await cloneData(client, from, TEMPLATE);
    if (flag("catalog-only")) {
      for (const t of ["payments", "appointments", "clients", "masters"]) {
        await client.query(`DELETE FROM ${quoteIdent(TEMPLATE)}.${t}`);
      }
    }
    await client.query("COMMIT");

    console.log(`✅ Demo template "${TEMPLATE}" created from "${from}". Contents:`);
    for (const t of [...CATALOG, "masters", "clients", "appointments", "payments"]) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${quoteIdent(TEMPLATE)}.${t}`);
      console.log(`   ${t.padEnd(13)} ${rows[0].n}`);
    }
    console.log("   Check that it contains no real people's data before using it for sign-ups.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function splitUsers() {
  const tenantSchema = arg("tenant");
  const keep = (arg("keep") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!tenantSchema) throw new Error("--tenant <branch schema> is required");

  const t = await pool.query(`SELECT id FROM public.tenants WHERE schema_name = $1`, [tenantSchema]);
  if (!t.rows.length) throw new Error(`No branch with schema "${tenantSchema}"`);

  const plan = process.env.DEMO_PLAN_CODE || "pro";
  const { rows: users } = await pool.query(
    `SELECT u.id, u.email, u.name FROM public.users u
       JOIN public.user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = $1
      WHERE u.is_active AND u.role <> 'owner' AND NOT (lower(u.email) = ANY($2::text[]))
      ORDER BY u.created_at`,
    [t.rows[0].id, keep]
  );
  if (!users.length) return console.log("Nobody to move.");

  for (const u of users) {
    const acc = await pool.query(
      `INSERT INTO public.accounts (name, plan_id, is_demo)
       SELECT $1, id, true FROM public.plans WHERE code = $2 RETURNING id`,
      [`Demo: ${u.name || u.email}`, plan]
    );
    const accountId = acc.rows[0].id;
    try {
      const tenant = await createTenant({ accountId, name: "Demo salon", cloneFrom: TEMPLATE, ownerUserId: u.id });
      await pool.query(`DELETE FROM public.user_tenants WHERE user_id = $1`, [u.id]);
      await pool.query(
        `UPDATE public.users SET account_id = $1, role = 'owner', tenant_id = $2,
                token_version = token_version + 1
          WHERE id = $3`,
        [accountId, tenant.id, u.id]
      );
      console.log(`   moved ${u.email} -> own demo (${tenant.schema_name})`);
    } catch (err) {
      await pool.query(`DELETE FROM public.accounts WHERE id = $1`, [accountId]).catch(() => {});
      throw new Error(`${u.email}: ${err.message}`);
    }
  }
  console.log(`✅ ${users.length} demo user(s) now have their own private demo.`);
}

(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === "snapshot") await snapshot();
    else if (cmd === "split-users") await splitUsers();
    else {
      console.log("Usage:\n  npm run demo-template -- snapshot --from salon_demo [--catalog-only]\n  npm run demo-template -- split-users --tenant salon_demo --keep you@example.com");
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("❌", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
