const express = require("express");
const router = express.Router();

const db = require("../db");
const pool = db.pool; // <-- FIX: your db.js exports { query, pool }

const { authenticateToken, authorizeRoles } = require("../middleware/auth");

function isValidSchemaName(v) {
  return typeof v === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(v);
}

function quoteIdent(ident) {
  return `"${String(ident).replaceAll('"', '""')}"`;
}

async function copyFromTemplateSchema(client, targetSchema) {
  const tmpl = quoteIdent("salon_demo");
  const t = quoteIdent(targetSchema);

  // Extensions required by template defaults/constraints
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

  // Tables (dependency order)
  await client.query(`CREATE TABLE IF NOT EXISTS ${t}.settings (LIKE ${tmpl}.settings INCLUDING ALL);`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${t}.services (LIKE ${tmpl}.services INCLUDING ALL);`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${t}.masters (LIKE ${tmpl}.masters INCLUDING ALL);`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${t}.clients (LIKE ${tmpl}.clients INCLUDING ALL);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_type ON ${t}.clients USING btree ("type");`);

  await client.query(`CREATE TABLE IF NOT EXISTS ${t}.appointments (LIKE ${tmpl}.appointments INCLUDING ALL);`);
  await client.query(`
    CREATE INDEX IF NOT EXISTS no_overlap_per_master
    ON ${t}.appointments USING gist (master_id, tstzrange(start_time, end_time))
    WHERE (status <> 'cancelled'::text);
  `);

  await client.query(`CREATE TABLE IF NOT EXISTS ${t}.payments (LIKE ${tmpl}.payments INCLUDING ALL);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON ${t}.payments USING btree (paid_at DESC);`);

  // Defensive FK ensures (names scoped per table regclass)
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'appointments_client_id_fkey'
          AND conrelid = '${targetSchema}.appointments'::regclass
      ) THEN
        ALTER TABLE ${t}.appointments
        ADD CONSTRAINT appointments_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES ${t}.clients(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'appointments_master_id_fkey'
          AND conrelid = '${targetSchema}.appointments'::regclass
      ) THEN
        ALTER TABLE ${t}.appointments
        ADD CONSTRAINT appointments_master_id_fkey
        FOREIGN KEY (master_id) REFERENCES ${t}.masters(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'appointments_service_id_fkey'
          AND conrelid = '${targetSchema}.appointments'::regclass
      ) THEN
        ALTER TABLE ${t}.appointments
        ADD CONSTRAINT appointments_service_id_fkey
        FOREIGN KEY (service_id) REFERENCES ${t}.services(id);
      END IF;
    END $$;
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_partner_id'
          AND conrelid = '${targetSchema}.payments'::regclass
      ) THEN
        ALTER TABLE ${t}.payments
        ADD CONSTRAINT fk_partner_id
        FOREIGN KEY (partner_id) REFERENCES ${t}.clients(id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_appointment_id_fkey'
          AND conrelid = '${targetSchema}.payments'::regclass
      ) THEN
        ALTER TABLE ${t}.payments
        ADD CONSTRAINT payments_appointment_id_fkey
        FOREIGN KEY (appointment_id) REFERENCES ${t}.appointments(id);
      END IF;
    END $$;
  `);
}

/**
 * GET /api/tenants (any authenticated)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, schema_name, is_active, created_at
       FROM public.tenants
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/tenants error:", err);
    res.status(500).json({ message: "Failed to load tenants" });
  }
});

/**
 * GET /api/tenants/public
 * Public list of active tenants for login dropdown
 */
router.get("/public", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, schema_name
       FROM public.tenants
       WHERE is_active = true
       ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("GET /api/tenants/public error:", err);
    return res.status(500).json({ message: "Failed to load branches" });
  }
});

/**
 * POST /api/tenants (admin)
 * Creates schema + clones from salon_demo + inserts row.
 */
router.post("/", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, schema_name, is_active } = req.body || {};

    if (!name || typeof name !== "string") return res.status(400).json({ message: "name is required" });
    if (!schema_name || !isValidSchemaName(schema_name)) {
      return res.status(400).json({ message: "schema_name is required and must be a valid Postgres identifier" });
    }

    const safeSchema = schema_name.trim();

    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(safeSchema)}`);
    await copyFromTemplateSchema(client, safeSchema);

    const { rows } = await client.query(
      `INSERT INTO public.tenants (name, schema_name, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING id, name, schema_name, is_active, created_at`,
      [name.trim(), safeSchema, typeof is_active === "boolean" ? is_active : true]
    );

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/tenants error:", err);
    if (err.code === "23505") return res.status(409).json({ message: "Tenant already exists" });
    res.status(500).json({ message: "Failed to create tenant" });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/tenants/:id (admin)
 * Renames schema if changed, updates row.
 */
router.put("/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, schema_name, is_active } = req.body || {};

    if (!name || typeof name !== "string") return res.status(400).json({ message: "name is required" });
    if (!schema_name || !isValidSchemaName(schema_name)) {
      return res.status(400).json({ message: "schema_name is required and must be a valid Postgres identifier" });
    }
    if (typeof is_active !== "boolean") return res.status(400).json({ message: "is_active must be boolean" });

    const newSchema = schema_name.trim();

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, schema_name
       FROM public.tenants
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Tenant not found" });
    }

    const oldSchema = existing.rows[0].schema_name;

    if (oldSchema && oldSchema !== newSchema) {
      const check = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [newSchema]
      );
      if (check.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Target schema_name already exists" });
      }

      await client.query(`ALTER SCHEMA ${quoteIdent(oldSchema)} RENAME TO ${quoteIdent(newSchema)}`);
    }

    const { rows } = await client.query(
      `UPDATE public.tenants
       SET name = $2,
           schema_name = $3,
           is_active = $4
       WHERE id = $1
       RETURNING id, name, schema_name, is_active, created_at`,
      [id, name.trim(), newSchema, is_active]
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PUT /api/tenants/:id error:", err);
    if (err.code === "23505") return res.status(409).json({ message: "Tenant already exists" });
    res.status(500).json({ message: "Failed to update tenant" });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/tenants/:id (admin)
 * Deletes row + drops schema cascade.
 */
router.delete("/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const { rows: foundRows } = await client.query(
      `SELECT id, schema_name
       FROM public.tenants
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (!foundRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Tenant not found" });
    }

    const schemaName = foundRows[0].schema_name;

    await client.query(`DELETE FROM public.tenants WHERE id = $1`, [id]);

    if (schemaName && isValidSchemaName(schemaName)) {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
    }

    await client.query("COMMIT");
    res.status(204).send();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/tenants/:id error:", err);
    res.status(500).json({ message: "Failed to delete tenant" });
  } finally {
    client.release();
  }
});

module.exports = router;