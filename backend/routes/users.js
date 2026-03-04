const express = require("express");
const bcryptjs = require("bcryptjs");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { tenantContext } = require("../middleware/tenantContext");

const router = express.Router();

function requireAdmin(req, res) {
  if (req.user.role !== "admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

// GET users (admin only) + optional filter
router.get("/", authenticateToken, tenantContext, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { tenant_id } = req.query;

  try {
    const params = [];
    let where = "";

    if (tenant_id) {
      params.push(tenant_id);
      where = `WHERE u.tenant_id = $${params.length}`;
    }

    const { rows } = await db.query(
      `
      SELECT
        u.id,
        u.email,
        u.role,
        u.tenant_id,
        u.created_at,
        t.name AS tenant_name,
        t.schema_name AS tenant_schema_name
      FROM public.users u
      LEFT JOIN public.tenants t ON t.id = u.tenant_id
      ${where}
      ORDER BY u.created_at DESC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("FETCH USERS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET single user by id (admin only)
router.get("/:id", authenticateToken, tenantContext, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  try {
    const { rows } = await db.query(
      `SELECT id, email, role, tenant_id, created_at FROM public.users WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ message: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST create user (admin only)
router.post("/", authenticateToken, tenantContext, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { email, password, role, tenant_id } = req.body;
  if (!email || !password || !role) return res.status(400).json({ message: "email/password/role required" });

  // IMPORTANT: allow choosing branch; fallback to current admin tenant
  const finalTenantId = tenant_id || req.user.tenantId;
  if (!finalTenantId) return res.status(400).json({ message: "tenant_id is required" });

  try {
    // ✅ FIX: uniqueness per tenant
    const exists = await db.query(
      "SELECT id FROM public.users WHERE tenant_id = $1 AND email = $2",
      [finalTenantId, email]
    );
    if (exists.rows.length > 0) return res.status(409).json({ message: "User already exists" });

    const hash = await bcryptjs.hash(password, 10);

    const { rows } = await db.query(
      `INSERT INTO public.users (email, password_hash, role, tenant_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, tenant_id, created_at`,
      [email, hash, role, finalTenantId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE USER ERROR:", err);

    // If DB has unique(tenant_id,email), surface friendly 409
    if (err.code === "23505") return res.status(409).json({ message: "User already exists" });

    res.status(500).json({ message: "Server error" });
  }
});

// PUT update user (admin only)
router.put("/:id", authenticateToken, tenantContext, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;
  const { email, password, role, tenant_id } = req.body;

  if (!email || !role) return res.status(400).json({ message: "email and role required" });

  try {
    const checkUser = await db.query(
      "SELECT id, email, tenant_id FROM public.users WHERE id = $1",
      [id]
    );

    if (checkUser.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const current = checkUser.rows[0];
    const nextTenantId = tenant_id || current.tenant_id;

    // ✅ FIX: check uniqueness per (tenant_id, email), excluding current user
    if (current.email !== email || current.tenant_id !== nextTenantId) {
      const emailExists = await db.query(
        "SELECT id FROM public.users WHERE tenant_id = $1 AND email = $2 AND id <> $3",
        [nextTenantId, email, id]
      );
      if (emailExists.rows.length > 0) return res.status(409).json({ message: "Email already in use" });
    }

    let updateQuery;
    let updateParams;

    if (password) {
      const hash = await bcryptjs.hash(password, 10);
      updateQuery = `
        UPDATE public.users
        SET email = $1,
            password_hash = $2,
            role = $3,
            tenant_id = $4
        WHERE id = $5
        RETURNING id, email, role, tenant_id, created_at
      `;
      updateParams = [email, hash, role, nextTenantId, id];
    } else {
      updateQuery = `
        UPDATE public.users
        SET email = $1,
            role = $2,
            tenant_id = $3
        WHERE id = $4
        RETURNING id, email, role, tenant_id, created_at
      `;
      updateParams = [email, role, nextTenantId, id];
    }

    const { rows } = await db.query(updateQuery, updateParams);
    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    if (err.code === "23505") return res.status(409).json({ message: "Email already in use" });
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE user (admin only)
router.delete("/:id", authenticateToken, tenantContext, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { id } = req.params;

  try {
    const checkUser = await db.query("SELECT id FROM public.users WHERE id = $1", [id]);
    if (checkUser.rows.length === 0) return res.status(404).json({ message: "User not found" });

    if (req.user.id === id) return res.status(400).json({ message: "You cannot delete yourself" });

    await db.query("DELETE FROM public.users WHERE id = $1", [id]);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;