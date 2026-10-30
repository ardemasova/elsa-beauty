/**
 * Minimal migration runner.
 *
 *  migrations/public/NNN_name.sql  -> applied once to the shared schema,
 *                                     tracked in public.schema_migrations
 *  migrations/tenant/NNN_name.sql  -> applied to EVERY branch schema,
 *                                     tracked in <schema>.schema_migrations
 *
 * Each file runs in its own transaction. Tenant files run with
 * search_path = <schema>, public, so they use unqualified table names.
 */
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");
const { quoteIdent, isValidSchemaName } = require("../utils/sql");

const PUBLIC_DIR = path.join(__dirname, "public");
const TENANT_DIR = path.join(__dirname, "tenant");
const LOCK_KEY = 72510431; // arbitrary constant for pg_advisory_lock

function listMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));
}

async function ensureTable(client, schemaQuoted) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${schemaQuoted}.schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );
}

async function appliedSet(client, schemaQuoted) {
  const { rows } = await client.query(`SELECT name FROM ${schemaQuoted}.schema_migrations`);
  return new Set(rows.map((r) => r.name));
}

async function applyFile(client, schemaQuoted, migration, { searchPath, log }) {
  await client.query("BEGIN");
  try {
    if (searchPath) await client.query(`SET LOCAL search_path TO ${searchPath}`);
    await client.query(migration.sql);
    await client.query(`INSERT INTO ${schemaQuoted}.schema_migrations (name) VALUES ($1)`, [migration.name]);
    await client.query("COMMIT");
    log(`  applied ${migration.name}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    err.message = `Migration ${migration.name} failed for ${schemaQuoted}: ${err.message}`;
    throw err;
  }
}

async function migratePublic(client, log = console.log) {
  await ensureTable(client, "public");
  const done = await appliedSet(client, "public");
  for (const m of listMigrations(PUBLIC_DIR)) {
    if (!done.has(m.name)) await applyFile(client, "public", m, { searchPath: "public", log });
  }
}

/** Creates (if needed) and migrates one branch schema. `client` must not be inside a transaction. */
async function migrateTenantSchema(client, schemaName, log = console.log) {
  if (!isValidSchemaName(schemaName)) throw new Error(`Invalid schema name: ${schemaName}`);
  const q = quoteIdent(schemaName);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${q}`);
  await ensureTable(client, q);
  const done = await appliedSet(client, q);
  for (const m of listMigrations(TENANT_DIR)) {
    if (!done.has(m.name)) await applyFile(client, q, m, { searchPath: `${q}, public`, log });
  }
}

async function tenantSchemas(client) {
  const names = new Set();
  const { rows } = await client.query(`SELECT schema_name FROM public.tenants ORDER BY created_at`);
  rows.forEach((r) => names.add(r.schema_name));

  // The demo template is cloned for every demo sign-up, keep it migrated too.
  const template = process.env.DEMO_TEMPLATE_SCHEMA || "salon_demo";
  const t = await client.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [template]);
  if (t.rows.length) names.add(template);
  return [...names];
}

async function migrateAll(log = console.log) {
  const client = await pool.connect();
  try {
    await client.query("SET client_min_messages = warning"); // hide "already exists, skipping" noise
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    log("Public schema:");
    await migratePublic(client, log);
    for (const schema of await tenantSchemas(client)) {
      log(`Branch schema ${schema}:`);
      await migrateTenantSchema(client, schema, log);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

module.exports = { migrateAll, migratePublic, migrateTenantSchema, listMigrations };
