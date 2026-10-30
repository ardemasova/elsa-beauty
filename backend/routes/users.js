/**
 * Staff logins of an account.
 *   owner  - sees and manages every user of the account (admins and masters,
 *            in any of the account's branches)
 *   admin  - sees users of the current branch, can add/edit/remove masters there
 *   master - no access
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { authenticate, listAccessibleTenants } = require("../middleware/auth");
const { assertUserLimit } = require("../services/provisioning");

const router = express.Router();
const MIN_PASSWORD = 8;

router.use(authenticate(), (req, res, next) => {
  if (req.user.isOwner) return next();
  if (req.user.role === "admin" && req.tenant) return next();
  return res.status(403).json({ message: "Forbidden" });
});

const SELECT_USERS = `
  SELECT u.id, u.email, u.name, u.phone, u.role, u.is_active, u.created_at,
         COALESCE(array_agg(t.id ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL), '{}') AS tenant_ids,
         COALESCE(array_agg(t.name ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL), '{}') AS tenant_names
    FROM public.users u
    LEFT JOIN public.user_tenants ut ON ut.user_id = u.id
    LEFT JOIN public.tenants t ON t.id = ut.tenant_id`;

function shape(row) {
  return {
    ...row,
    // kept for the existing UI, which shows one branch per user
    tenant_id: row.tenant_ids[0] || null,
    tenant_name: row.tenant_names.join(", ") || null,
  };
}

/** Returns the user if the caller may manage them, otherwise null. */
async function findInScope(req, userId) {
  const params = [req.user.accountId, userId];
  let extra = "";
  if (!req.user.isOwner) {
    params.push(req.tenant.id);
    extra = `AND EXISTS (SELECT 1 FROM public.user_tenants x WHERE x.user_id = u.id AND x.tenant_id = $3)`;
  }
  const { rows } = await db.query(
    `${SELECT_USERS} WHERE u.account_id = $1 AND u.id = $2 ${extra} GROUP BY u.id`,
    params
  );
  return rows[0] ? shape(rows[0]) : null;
}

/** Validates the requested branch list against what the caller may assign. */
async function resolveTenantIds(req, body) {
  if (!req.user.isOwner) return [req.tenant.id]; // admins only add staff to their current branch

  let ids = Array.isArray(body.tenant_ids) ? body.tenant_ids : body.tenant_id ? [body.tenant_id] : [];
  ids = [...new Set(ids.filter(Boolean))];
  if (!ids.length) return null;

  const { rows } = await db.query(
    `SELECT id FROM public.tenants WHERE account_id = $1 AND id = ANY($2::uuid[])`,
    [req.user.accountId, ids]
  );
  return rows.length === ids.length ? ids : null;
}

/**
 * An admin may change logins/passwords or delete a user only if every branch
 * that user works in is also one of the admin's branches. Otherwise the admin
 * could take over a master who also works in a branch the admin cannot see.
 */
async function adminControlsAllBranchesOf(req, target) {
  if (req.user.isOwner) return true;
  const mine = new Set((await listAccessibleTenants(req.auth)).map((t) => t.id));
  return target.tenant_ids.every((id) => mine.has(id));
}

function allowedRoles(req) {
  return req.user.isOwner ? ["admin", "master"] : ["master"];
}

// GET /api/users[?tenant_id=]
router.get("/", async (req, res, next) => {
  try {
    const params = [req.user.accountId];
    let where = "WHERE u.account_id = $1";
    const filterTenant = req.user.isOwner ? req.query.tenant_id : req.tenant.id;
    if (filterTenant) {
      params.push(filterTenant);
      where += ` AND EXISTS (SELECT 1 FROM public.user_tenants x WHERE x.user_id = u.id AND x.tenant_id = $2)`;
    }
    const { rows } = await db.query(`${SELECT_USERS} ${where} GROUP BY u.id ORDER BY u.created_at DESC`, params);
    res.json(rows.map(shape));
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get("/:id", async (req, res, next) => {
  try {
    const user = await findInScope(req, req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/users  { email, password, role, tenant_id | tenant_ids, name?, phone? }
router.post("/", async (req, res, next) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = req.body?.role;

  if (!email || !password || !role) return res.status(400).json({ message: "Email, password and role are required" });
  if (password.length < MIN_PASSWORD) return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
  if (!allowedRoles(req).includes(role)) return res.status(403).json({ message: `You cannot create users with role "${role}"` });

  try {
    const tenantIds = await resolveTenantIds(req, req.body);
    if (!tenantIds) return res.status(400).json({ message: "Choose at least one valid branch" });

    await assertUserLimit(db, req.user.accountId);
    const hash = await bcrypt.hash(password, 12);

    const id = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.users (email, password_hash, role, account_id, tenant_id, name, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [email, hash, role, req.user.accountId, tenantIds[0], req.body.name || null, req.body.phone || null]
      );
      for (const tid of tenantIds) {
        await client.query(`INSERT INTO public.user_tenants (user_id, tenant_id) VALUES ($1, $2)`, [rows[0].id, tid]);
      }
      return rows[0].id;
    });

    res.status(201).json(await findInScope(req, id));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "A user with this email already exists" });
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
});

// PUT /api/users/:id  { email, password?, role, tenant_id | tenant_ids, is_active?, name?, phone? }
router.put("/:id", async (req, res, next) => {
  try {
    const target = await findInScope(req, req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    const isSelf = target.id === req.user.id;
    if (target.role === "owner" && !isSelf) return res.status(403).json({ message: "Forbidden" });
    if (!req.user.isOwner && target.role !== "master" && !isSelf) {
      return res.status(403).json({ message: "Admins can only edit masters" });
    }

    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : target.email;
    const role = req.body?.role || target.role;
    if (isSelf && role !== target.role) return res.status(400).json({ message: "You cannot change your own role" });
    if (!isSelf && !allowedRoles(req).includes(role)) return res.status(403).json({ message: `You cannot assign role "${role}"` });

    if (isSelf && req.body?.password) {
      return res.status(400).json({ message: "Use \"Change password\" to change your own password" });
    }
    if (!isSelf && !(await adminControlsAllBranchesOf(req, target))) {
      return res.status(403).json({ message: "This user also works in other branches. Ask the account owner to change it." });
    }

    const isActive = typeof req.body?.is_active === "boolean" ? req.body.is_active : target.is_active;
    if (isSelf && !isActive) return res.status(400).json({ message: "You cannot deactivate yourself" });

    let tenantIds = null;
    if (req.user.isOwner && !isSelf && (req.body?.tenant_ids || req.body?.tenant_id)) {
      tenantIds = await resolveTenantIds(req, req.body);
      if (!tenantIds) return res.status(400).json({ message: "Choose at least one valid branch" });
    }

    const password = req.body?.password ? String(req.body.password) : null;
    if (password && password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    const hash = password ? await bcrypt.hash(password, 12) : null;

    await db.withTransaction(async (client) => {
      await client.query(
        `UPDATE public.users
            SET email = $1, role = $2, is_active = $3,
                name = COALESCE($4, name), phone = COALESCE($5, phone),
                password_hash = COALESCE($6, password_hash),
                -- new password, deactivation or role change ends existing sessions
                token_version = token_version + CASE WHEN $6::text IS NOT NULL OR NOT $3 OR $2 <> role OR $1 <> email THEN 1 ELSE 0 END
          WHERE id = $7`,
        [email, role, isActive, req.body?.name ?? null, req.body?.phone ?? null, hash, target.id]
      );
      if (tenantIds) {
        await client.query(`DELETE FROM public.user_tenants WHERE user_id = $1`, [target.id]);
        for (const tid of tenantIds) {
          await client.query(`INSERT INTO public.user_tenants (user_id, tenant_id) VALUES ($1, $2)`, [target.id, tid]);
        }
        await client.query(`UPDATE public.users SET tenant_id = $1 WHERE id = $2`, [tenantIds[0], target.id]);
      }
    });

    res.json(await findInScope(req, target.id));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "A user with this email already exists" });
    next(err);
  }
});

// DELETE /api/users/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const target = await findInScope(req, req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.id === req.user.id) return res.status(400).json({ message: "You cannot delete yourself" });
    if (target.role === "owner") return res.status(403).json({ message: "The account owner cannot be deleted" });
    if (!req.user.isOwner && target.role !== "master") return res.status(403).json({ message: "Admins can only remove masters" });

    if (!(await adminControlsAllBranchesOf(req, target))) {
      // Works elsewhere too: only remove them from this branch.
      await db.query(`DELETE FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2`, [target.id, req.tenant.id]);
      return res.json({ message: "User removed from this branch" });
    }

    await db.query(`DELETE FROM public.users WHERE id = $1 AND account_id = $2`, [target.id, req.user.accountId]);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
