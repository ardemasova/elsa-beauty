const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const {
  authenticate,
  signToken,
  loadContext,
  listAccessibleTenants,
} = require("../middleware/auth");
const { loadAccountFeatures } = require("../services/featureCache");

const router = express.Router();

// Used when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

async function sessionPayload(ctx) {
  const tenants = (await listAccessibleTenants(ctx)).filter((t) => t.is_active);
  return {
    user: {
      id: ctx.userId,
      email: ctx.email,
      name: ctx.name,
      role: ctx.role,
      accountRole: ctx.accountRole,
      isOwner: ctx.isOwner,
    },
    account: { id: ctx.accountId, name: ctx.accountName, isDemo: ctx.isDemo },
    tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
    currentTenant: ctx.tenant ? { id: ctx.tenant.id, name: ctx.tenant.name } : null,
    features: await loadAccountFeatures(ctx.accountId),
  };
}

function tokenFor(ctx) {
  return signToken({
    userId: ctx.userId,
    tenantId: ctx.tenant?.id,
    role: ctx.role,
    accountRole: ctx.accountRole,
    email: ctx.email,
    schemaName: ctx.tenant?.schema,
  });
}

/** Picks the branch to open after login: last used if still allowed, else the first one. */
async function pickTenant(ctx, preferredId) {
  const tenants = (await listAccessibleTenants(ctx)).filter((t) => t.is_active);
  if (!tenants.length) return null;
  return tenants.find((t) => t.id === preferredId) || tenants[0];
}

// POST /api/auth/login  { email, password }
router.post("/login", async (req, res, next) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  try {
    const { rows } = await db.query(
      `SELECT id, password_hash, tenant_id FROM public.users WHERE lower(email) = $1`,
      [email]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ message: "Invalid email or password" });

    const base = await loadContext(user.id, null);
    if (!base) return res.status(403).json({ message: "This account is disabled. Contact support." });

    const tenant = await pickTenant(base, user.tenant_id);
    if (!tenant && !base.isOwner) {
      return res.status(403).json({ message: "You have no branch assigned. Contact your administrator." });
    }

    const ctx = tenant ? await loadContext(user.id, tenant.id) : base;
    if (tenant) await db.query(`UPDATE public.users SET tenant_id = $1 WHERE id = $2`, [tenant.id, user.id]);

    res.json({ token: tokenFor(ctx), ...(await sessionPayload(ctx)) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - who am I, which branches can I open, what does my plan include
router.get("/me", authenticate(), async (req, res, next) => {
  try {
    res.json(await sessionPayload(req.auth));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh - new token for a still-valid session
router.post("/refresh", authenticate(), (req, res) => {
  res.json({ token: tokenFor(req.auth) });
});

// POST /api/auth/switch-tenant  { tenant_id }
router.post("/switch-tenant", authenticate(), async (req, res, next) => {
  try {
    const tenantId = req.body?.tenant_id;
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" });

    const ctx = await loadContext(req.auth.userId, tenantId);
    if (!ctx || ctx.tenantDenied || !ctx.tenant) return res.status(403).json({ message: "No access to this branch" });

    await db.query(`UPDATE public.users SET tenant_id = $1 WHERE id = $2`, [tenantId, ctx.userId]);
    res.json({ token: tokenFor(ctx), ...(await sessionPayload(ctx)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password  { current_password, new_password }
router.post("/change-password", authenticate(), async (req, res, next) => {
  const current = String(req.body?.current_password || "");
  const next_ = String(req.body?.new_password || "");
  if (next_.length < 10) return res.status(400).json({ message: "New password must be at least 10 characters" });

  try {
    const { rows } = await db.query(`SELECT password_hash FROM public.users WHERE id = $1`, [req.auth.userId]);
    if (!rows[0] || !(await bcrypt.compare(current, rows[0].password_hash))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    const hash = await bcrypt.hash(next_, 12);
    await db.query(`UPDATE public.users SET password_hash = $1 WHERE id = $2`, [hash, req.auth.userId]);
    res.json({ message: "Password changed" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
