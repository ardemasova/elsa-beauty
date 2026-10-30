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
  payments: `WHERE x.partner_id IN (SELECT id FROM $FROM.clients)
               AND (x.item_id IS NULL OR x.item_id IN (SELECT id FROM $FROM.items))
               AND (x.expense_id IS NULL OR x.expense_id IN (SELECT id FROM $FROM.expenses))
               AND (x.appointment_id IS NULL OR x.appointment_id IN (
                     SELECT a.id FROM $FROM.appointments a
                      WHERE a.master_id IN (SELECT id FROM $FROM.masters)
                        AND a.service_id IN (SELECT id FROM $FROM.services)
                        AND (a.client_id IS NULL OR a.client_id IN (SELECT id FROM $FROM.clients))))`,
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

async function cloneData(client, fromSchema, toSchema, ownerUserId) {
  const from = quoteIdent(fromSchema);
  const to = quoteIdent(toSchema);
  for (const table of CLONE_TABLES) {
    const { rows } = await client.query(
      `SELECT c.column_name
         FROM information_schema.columns c
         JOIN information_schema.columns s
           ON s.table_schema = $2 AND s.table_name = c.table_name AND s.column_name = c.column_name
        WHERE c.table_schema = $1 AND c.table_name = $3
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

async function seedDefaults(client, schema, branchName) {
  const s = quoteIdent(schema);
  await client.query(`INSERT INTO ${s}.settings (name) VALUES ($1)`, [branchName]);
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

      if (cloneFrom) await cloneData(client, cloneFrom, schema, ownerUserId);
      else await seedDefaults(client, schema, branchName);

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
  createAccount,
  createTenant,
  assertUserLimit,
  ProvisioningError,
};
