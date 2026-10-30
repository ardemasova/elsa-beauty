/**
 * Authentication and branch (tenant) access.
 *
 * The JWT only says WHO the user is (sub) and WHICH branch they are working in
 * (tid). Everything else - role, active flags, whether the user may access that
 * branch - is re-read from the database on every request, so deactivating a
 * user, a branch or an account takes effect immediately.
 *
 * After `authenticateToken`:
 *   req.user   = { id, userId, email, role, accountRole, isOwner, accountId,
 *                  tenantId, schema_name }
 *                role is the role INSIDE the current branch: "admin" | "master"
 *                (an owner acts as "admin" in every branch of the account)
 *   req.tenant = { id, name, schema, schemaQuoted, accountId }
 */
const jwt = require("jsonwebtoken");
const db = require("../db");
const { quoteIdent } = require("../utils/sql");

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "12h";
// A session can be refreshed, but never lives longer than this after login.
const SESSION_MAX_SECONDS = Number(process.env.SESSION_MAX_DAYS || 30) * 24 * 3600;

function signToken(ctx) {
  // role/email/schema_name are included only so the UI can render without an
  // extra request; the server never trusts them.
  return jwt.sign(
    {
      sub: ctx.userId,
      tid: ctx.tenantId || null,
      tv: ctx.tokenVersion,
      auth_time: ctx.authTime || Math.floor(Date.now() / 1000),
      role: ctx.role,
      accountRole: ctx.accountRole,
      email: ctx.email,
      tenantId: ctx.tenantId || null,
      schema_name: ctx.schemaName || null,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: TOKEN_TTL, algorithm: "HS256" }
  );
}

/**
 * Loads the user and (optionally) checks access to a branch.
 * Returns null when the user may not proceed.
 */
async function loadContext(userId, tenantId) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.name, u.role AS account_role, u.is_active, u.account_id, u.token_version,
            a.is_active AS account_active, a.name AS account_name, a.is_demo,
            t.id AS tenant_id, t.name AS tenant_name, t.schema_name, t.is_active AS tenant_active,
            t.account_id AS tenant_account_id,
            EXISTS (SELECT 1 FROM public.user_tenants ut
                     WHERE ut.user_id = u.id AND ut.tenant_id = t.id) AS linked
       FROM public.users u
       JOIN public.accounts a ON a.id = u.account_id
       LEFT JOIN public.tenants t ON t.id = $2
      WHERE u.id = $1`,
    [userId, tenantId || null]
  );
  const r = rows[0];
  if (!r || !r.is_active || !r.account_active) return null;

  const isOwner = r.account_role === "owner";
  const ctx = {
    userId: r.id,
    tokenVersion: r.token_version,
    email: r.email,
    name: r.name,
    accountId: r.account_id,
    accountName: r.account_name,
    accountRole: r.account_role,
    isDemo: r.is_demo,
    isOwner,
    tenant: null,
    role: isOwner ? "admin" : r.account_role,
  };

  if (tenantId) {
    const allowed =
      r.tenant_id &&
      r.tenant_active &&
      r.tenant_account_id === r.account_id &&
      (isOwner || r.linked);
    if (!allowed) return { ...ctx, tenantDenied: true };
    ctx.tenant = {
      id: r.tenant_id,
      name: r.tenant_name,
      schema: r.schema_name,
      schemaQuoted: quoteIdent(r.schema_name),
      accountId: r.account_id,
    };
  }
  return ctx;
}

/** Branches this user may work in. */
async function listAccessibleTenants(ctx) {
  const { rows } = await db.query(
    ctx.isOwner
      ? `SELECT id, name, schema_name, is_active, created_at
           FROM public.tenants WHERE account_id = $1 ORDER BY created_at`
      : `SELECT t.id, t.name, t.schema_name, t.is_active, t.created_at
           FROM public.tenants t
           JOIN public.user_tenants ut ON ut.tenant_id = t.id AND ut.user_id = $2
          WHERE t.account_id = $1 ORDER BY t.created_at`,
    ctx.isOwner ? [ctx.accountId] : [ctx.accountId, ctx.userId]
  );
  return rows;
}

function readToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

function attach(req, ctx) {
  req.auth = ctx;
  req.tenant = ctx.tenant;
  req.user = {
    id: ctx.userId,
    userId: ctx.userId,
    email: ctx.email,
    role: ctx.role,
    accountRole: ctx.accountRole,
    isOwner: ctx.isOwner,
    accountId: ctx.accountId,
    tenantId: ctx.tenant?.id || null,
    schema_name: ctx.tenant?.schema || null,
  };
}

/** Valid login required; a branch is optional (account-level routes). */
function authenticate({ requireTenant = false } = {}) {
  return async (req, res, next) => {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: "Authentication required" });

    let payload;
    try {
      payload = jwt.verify(token, ACCESS_TOKEN_SECRET, { algorithms: ["HS256"] });
    } catch {
      return res.status(401).json({ message: "Session expired, please log in again" });
    }
    // Tokens issued before this version have no `sub`: force a fresh login.
    if (!payload.sub) return res.status(401).json({ message: "Session expired, please log in again" });
    if (!payload.auth_time || Date.now() / 1000 - payload.auth_time > SESSION_MAX_SECONDS) {
      return res.status(401).json({ message: "Session expired, please log in again" });
    }

    try {
      let ctx = await loadContext(payload.sub, payload.tid);
      // Deactivated, deleted, or password changed since this token was issued.
      if (!ctx || ctx.tokenVersion !== payload.tv) {
        return res.status(401).json({ message: "Session expired, please log in again" });
      }
      ctx.authTime = payload.auth_time;
      if (ctx.tenantDenied) {
        if (requireTenant) return res.status(403).json({ message: "No access to this branch" });
        // Account-level routes (me / switch / refresh) keep working so the
        // user can move to a branch they still have.
        ctx = { ...ctx, tenantDenied: false, tenant: null };
      }
      if (requireTenant && !ctx.tenant) return res.status(400).json({ message: "Select a branch first" });
      attach(req, ctx);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Default guard for branch-level API routes. */
const authenticateToken = authenticate({ requireTenant: true });

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

const requireAdmin = authorizeRoles("admin");

function requireOwner(req, res, next) {
  if (!req.user?.isOwner) return res.status(403).json({ message: "Only the account owner can do this" });
  next();
}

module.exports = {
  authenticate,
  authenticateToken,
  authorizeRoles,
  requireAdmin,
  requireOwner,
  signToken,
  loadContext,
  listAccessibleTenants,
};
