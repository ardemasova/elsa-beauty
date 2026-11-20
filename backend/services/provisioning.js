/**
 * Creating accounts (customers) and tenants (branches).
 *
 * A branch is a PostgreSQL schema. It is created from the migration files in
 * migrations/tenant, so every branch always has exactly the same structure.
 */
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool, withTransaction } = require("../db");
const { migrateTenantSchema } = require("../migrations/runner");
const { quoteIdent, isValidSchemaName } = require("../utils/sql");

// Copy order respects foreign keys.
const CLONE_TABLES = ["settings", "services", "masters", "clients", "items", "expenses", "vat", "appointments", "payments"];

const CLONE_FILTERS = {
  appointments: `WHERE x.master_id IN (SELECT id FROM $FROM.masters)
                   AND x.service_id IN (SELECT id FROM $FROM.services)
                   AND (x.client_id IS NULL OR x.client_id IN (SELECT id FROM $FROM.clients))`,
  // Old rows may use payment methods the app no longer accepts; they are skipped.
  payments: `WHERE x.method IN ('Card', 'Cash')
               AND x.partner_id IN (SELECT id FROM $FROM.clients)
               AND (x.item_id IS NULL OR x.item_id IN (SELECT id FROM $FROM.items))
               AND (x.expense_id IS NULL OR x.expense_id IN (SELECT id FROM $FROM.expenses))
               AND (x.appointment_id IS NULL OR x.appointment_id IN (
                     SELECT a.id FROM $FROM.appointments a
                      WHERE a.master_id IN (SELECT id FROM $FROM.masters)
                        AND a.service_id IN (SELECT id FROM $FROM.services)
                        AND (a.client_id IS NULL OR a.client_id IN (SELECT id FROM $FROM.clients))))
               -- a credit note is copied only if the invoice it corrects is
               AND (x.refund_of IS NULL OR x.refund_of IN (
                     SELECT o.id FROM $FROM.payments o
                      WHERE o.method IN ('Card', 'Cash')
                        AND o.partner_id IN (SELECT id FROM $FROM.clients)
                        AND (o.item_id IS NULL OR o.item_id IN (SELECT id FROM $FROM.items))
                        AND (o.appointment_id IS NULL OR o.appointment_id IN (
                              SELECT a.id FROM $FROM.appointments a
                               WHERE a.master_id IN (SELECT id FROM $FROM.masters)
                                 AND a.service_id IN (SELECT id FROM $FROM.services)
                                 AND (a.client_id IS NULL OR a.client_id IN (SELECT id FROM $FROM.clients))))))`,
};

// Spain: general 21%, reduced 10%, super-reduced 4%.
const DEFAULT_VAT_RATES = [
  { percent: 21, is_default: "Y" },
  { percent: 10, is_default: "N" },
  { percent: 4, is_default: "N" },
];

class ProvisioningError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function newSchemaName(tenantId) {
  return `b_${tenantId.replace(/-/g, "")}`;
}

async function cloneData(client, fromSchema, toSchema, ownerUserId, tables = CLONE_TABLES) {
  const from = quoteIdent(fromSchema);
  const to = quoteIdent(toSchema);
  for (const table of CLONE_TABLES.filter((t) => tables.includes(t))) {
    const { rows } = await client.query(
      `SELECT c.column_name
         FROM information_schema.columns c
         JOIN information_schema.columns s
           ON s.table_schema = $2 AND s.table_name = c.table_name AND s.column_name = c.column_name
        WHERE c.table_schema = $1 AND c.table_name = $3
          AND c.is_generated = 'NEVER' -- computed columns (e.g. payments.amount_net) fill themselves
        ORDER BY c.ordinal_position`,
      [toSchema, fromSchema, table]
    );
    if (!rows.length) continue;
    const cols = rows.map((r) => quoteIdent(r.column_name)).join(", ");
    // Old data may reference deleted rows; such rows are not copied (the
    // copy has enforced foreign keys).
    const where = (CLONE_FILTERS[table] || "").replaceAll("$FROM", from);
    await client.query(`INSERT INTO ${to}.${table} (${cols}) SELECT ${cols} FROM ${from}.${table} x ${where}`);
  }
  // Demo masters belonged to logins of the template; point them at the new
  // owner so the copy references nobody outside its own account.
  if (ownerUserId) {
    await client.query(`UPDATE ${to}.masters SET user_id = $1`, [ownerUserId]);
  }
  for (const table of ["items", "expenses"]) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${to}.${table}', 'id'), COALESCE((SELECT max(id) FROM ${to}.${table}), 0) + 1, false)`
    );
  }
}

/** Invoice prefixes already used by the other branches of an account. */
async function usedPrefixes(q, accountId, exceptSchema) {
  const { rows } = await q.query(
    `SELECT schema_name FROM public.tenants WHERE account_id = $1 AND schema_name <> $2`,
    [accountId, exceptSchema || ""]
  );
  const used = new Set();
  for (const r of rows) {
    const p = await q
      .query(`SELECT upper(invoice_prefix) AS p FROM ${quoteIdent(r.schema_name)}.settings WHERE invoice_prefix IS NOT NULL`)
      .catch(() => ({ rows: [] }));
    p.rows.forEach((x) => used.add(x.p));
  }
  return used;
}

/**
 * "Lola Centro" -> "LOL", or "LOL2" if another branch of the same company
 * already uses "LOL": branches share one NIF, so their invoice numbers must
 * never coincide.
 */
async function uniquePrefix(q, accountId, branchName, schema) {
  const base = String(branchName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "B";
  const used = await usedPrefixes(q, accountId, schema);
  let cand = base;
  for (let k = 2; used.has(cand); k++) cand = `${base.slice(0, 5)}${k}`;
  return cand;
}

/**
 * Gives every customer document of a (freshly copied) branch a new number in
 * its own series and resets the counters, so numbers never repeat.
 */
async function renumberDocuments(client, schema) {
  const s = quoteIdent(schema);
  // One UPDATE (rows are touched once), uniqueness checked at commit.
  await client.query(`SET CONSTRAINTS ${s}.payments_document_number_key DEFERRED`);
  await client.query(`DELETE FROM ${s}.document_counters`);
  const tzRow = await client.query(`SELECT timezone FROM ${s}.settings ORDER BY created_at NULLS LAST LIMIT 1`);
  const tz = /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(tzRow.rows[0]?.timezone || "") ? tzRow.rows[0].timezone : "Europe/Madrid";
  await client.query(`
    WITH cfg AS (SELECT invoice_prefix AS prefix FROM ${s}.settings ORDER BY created_at NULLS LAST LIMIT 1),
    numbered AS (
      SELECT p.id,
             CASE WHEN p.document_type = 'credit_note' THEN 'R' ELSE 'F' END AS ser,
             EXTRACT(year FROM (p.paid_at AT TIME ZONE '${tz}'))::int AS yr,
             row_number() OVER (PARTITION BY p.document_type, EXTRACT(year FROM (p.paid_at AT TIME ZONE '${tz}'))
                                ORDER BY p.paid_at, p.id) AS n
        FROM ${s}.payments p WHERE p.type = 'incoming'
    )
    UPDATE ${s}.payments p
       SET document_number = concat_ws('-', NULLIF((SELECT prefix FROM cfg), ''), numbered.ser, numbered.yr::text, lpad(numbered.n::text, greatest(4, length(numbered.n::text)), '0'))
      FROM numbered WHERE numbered.id = p.id
       AND p.document_number IS DISTINCT FROM concat_ws('-', NULLIF((SELECT prefix FROM cfg), ''), numbered.ser, numbered.yr::text, lpad(numbered.n::text, greatest(4, length(numbered.n::text)), '0'))`);
  await client.query(`
    INSERT INTO ${s}.document_counters (series, year, last)
    SELECT CASE WHEN document_type = 'credit_note' THEN 'R' ELSE 'F' END,
           EXTRACT(year FROM (paid_at AT TIME ZONE '${tz}'))::int, count(*)
      FROM ${s}.payments WHERE type = 'incoming' GROUP BY 1, 2`);
  // Check uniqueness now, so the transaction can go on altering the table.
  await client.query(`SET CONSTRAINTS ${s}.payments_document_number_key IMMEDIATE`);
}

async function seedDefaults(client, schema, branchName, prefix) {
  const s = quoteIdent(schema);
  await client.query(`INSERT INTO ${s}.settings (name, invoice_prefix) VALUES ($1, $2)`, [branchName, prefix]);
  for (const v of DEFAULT_VAT_RATES) {
    await client.query(`INSERT INTO ${s}.vat (percent, is_default) VALUES ($1, $2)`, [v.percent, v.is_default]);
  }
}

/**
 * Creates a branch for an account, enforcing the plan's branch limit.
 * @param {object} opts
 * @param {string} opts.accountId
 * @param {string} opts.name
 * @param {string} [opts.cloneFrom]  template schema to copy data from (demo sign-ups)
 * @param {string} [opts.ownerUserId]
 */
async function createTenant({ accountId, name, cloneFrom, ownerUserId }) {
  const branchName = String(name || "").trim();
  if (!branchName) throw new ProvisioningError("Branch name is required");
  if (cloneFrom) await assertTemplate(cloneFrom);

  await assertBranchLimit(pool, accountId);

  const tenantId = crypto.randomUUID();
  const schema = newSchemaName(tenantId);
  const client = await pool.connect();
  try {
    await migrateTenantSchema(client, schema, () => {});

    return await withTransactionOn(client, async () => {
      // Lock the account row so two parallel requests cannot both pass the limit.
      await client.query(`SELECT id FROM public.accounts WHERE id = $1 FOR UPDATE`, [accountId]);
      await assertBranchLimit(client, accountId);

      const prefix = await uniquePrefix(client, accountId, branchName, schema);
      if (cloneFrom) {
        await cloneData(client, cloneFrom, schema, ownerUserId);
        await client.query(`UPDATE ${quoteIdent(schema)}.settings SET invoice_prefix = $1`, [prefix]);
        await renumberDocuments(client, schema);
      } else await seedDefaults(client, schema, branchName, prefix);

      const { rows } = await client.query(
        `INSERT INTO public.tenants (id, name, schema_name, is_active, account_id)
         VALUES ($1, $2, $3, true, $4)
         RETURNING id, name, schema_name, is_active, created_at, account_id`,
        [tenantId, branchName, schema, accountId]
      );
      return rows[0];
    });
  } catch (err) {
    // Roll back the half-created schema; the tenants row was never committed.
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The demo template must be a frozen schema that is NOT a live branch;
 * otherwise anyone working in that branch could plant data that is copied
 * into every new demo account. Create/refresh it with:
 *   npm run demo-template -- snapshot --from salon_demo
 */
async function assertTemplate(schema) {
  if (!isValidSchemaName(schema)) throw new ProvisioningError("Invalid demo template", 500);
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS present,
            EXISTS (SELECT 1 FROM public.tenants WHERE schema_name = $1) AS live`,
    [schema]
  );
  if (!rows[0].present) throw new ProvisioningError("Demo is not configured yet. Please try again later.", 503);
  if (rows[0].live) throw new ProvisioningError("Demo template must not be a live branch", 500);
}

async function withTransactionOn(client, fn) {
  await client.query("BEGIN");
  try {
    const r = await fn();
    await client.query("COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function assertBranchLimit(q, accountId) {
  const { rows } = await q.query(
    `SELECT p.max_branches,
            (SELECT count(*)::int FROM public.tenants t WHERE t.account_id = a.id AND t.is_active) AS used
       FROM public.accounts a
       JOIN public.plans p ON p.id = a.plan_id
      WHERE a.id = $1`,
    [accountId]
  );
  if (!rows.length) throw new ProvisioningError("Account not found", 404);
  const { max_branches, used } = rows[0];
  if (max_branches != null && used >= max_branches) {
    throw new ProvisioningError(
      `Your plan allows ${max_branches} branch(es). Upgrade the plan to open more.`,
      403
    );
  }
}

async function assertUserLimit(q, accountId) {
  const { rows } = await q.query(
    `SELECT p.max_users,
            (SELECT count(*)::int FROM public.users u WHERE u.account_id = a.id AND u.is_active) AS used
       FROM public.accounts a JOIN public.plans p ON p.id = a.plan_id
      WHERE a.id = $1`,
    [accountId]
  );
  if (!rows.length) throw new ProvisioningError("Account not found", 404);
  const { max_users, used } = rows[0];
  if (max_users != null && used >= max_users) {
    throw new ProvisioningError(`Your plan allows ${max_users} users. Upgrade the plan to add more.`, 403);
  }
}

/**
 * Creates an account with its owner and first branch.
 * Used by the onboarding script and by the demo sign-up.
 */
async function createAccount({ accountName, planCode = "standard", ownerEmail, ownerPassword, ownerName, ownerPhone, branchName, isDemo = false, cloneFrom }) {
  const email = String(ownerEmail || "").trim().toLowerCase();
  if (!email) throw new ProvisioningError("Owner email is required");
  if (!ownerPassword || String(ownerPassword).length < 10) {
    throw new ProvisioningError("Owner password must be at least 10 characters");
  }

  const passwordHash = await bcrypt.hash(String(ownerPassword), 12);

  const { account, owner } = await withTransaction(async (client) => {
    const plan = await client.query(`SELECT id FROM public.plans WHERE code = $1`, [planCode]);
    if (!plan.rows.length) throw new ProvisioningError(`Unknown plan: ${planCode}`);

    const exists = await client.query(`SELECT 1 FROM public.users WHERE lower(email) = $1`, [email]);
    if (exists.rows.length) throw new ProvisioningError("This email is already registered", 409);

    const acc = await client.query(
      `INSERT INTO public.accounts (name, plan_id, is_demo) VALUES ($1, $2, $3) RETURNING *`,
      [accountName || branchName || email, plan.rows[0].id, isDemo]
    );
    const usr = await client.query(
      `INSERT INTO public.users (email, password_hash, role, account_id, name, phone)
       VALUES ($1, $2, 'owner', $3, $4, $5)
       RETURNING id, email, role, account_id, name`,
      [email, passwordHash, acc.rows[0].id, ownerName || null, ownerPhone || null]
    );
    return { account: acc.rows[0], owner: usr.rows[0] };
  });

  let tenant;
  try {
    tenant = await createTenant({
      accountId: account.id,
      name: branchName || accountName || "Main",
      cloneFrom,
      ownerUserId: owner.id,
    });
  } catch (err) {
    // No branch -> the account is useless; remove it so the email can be reused.
    await pool.query(`DELETE FROM public.accounts WHERE id = $1`, [account.id]).catch(() => {});
    throw err;
  }
  await pool.query(`UPDATE public.users SET tenant_id = $1 WHERE id = $2`, [tenant.id, owner.id]);

  return { account, owner, tenant };
}

module.exports = {
  cloneData,
  usedPrefixes,
  renumberDocuments,
  createAccount,
  createTenant,
  assertUserLimit,
  ProvisioningError,
};
