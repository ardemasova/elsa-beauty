/**
 * Reports API (v2). All figures come from services/reports/metrics.js.
 *
 *   GET /api/analytics/overview?from&to          admin  - headline figures + change vs previous period
 *   GET /api/analytics/breakdown/:by?from&to     admin  - by = master | service | item | expense | day
 *   GET /api/analytics/receivables?from&to       admin  - completed but not (fully) paid appointments
 *   GET /api/analytics/branches?from&to          owner / multi-branch staff - every branch side by side
 *   GET /api/analytics/me?from&to                master - own figures only
 *
 * Dates are local calendar days (YYYY-MM-DD, inclusive) in the branch's time zone.
 */
const express = require("express");
const db = require("../db");
const { authenticateToken, requireAdmin, listAccessibleTenants } = require("../middleware/auth");
const { requireFeature } = require("../middleware/featureGuard");
const { resolveTenantSchema } = require("../utils/tenant");
const { quoteIdent } = require("../utils/sql");
const metrics = require("../services/reports/metrics");

const router = express.Router();
router.use(authenticateToken, requireFeature("basic_reports"));

const period = (req) => metrics.parsePeriod(req.query.from, req.query.to);

function handle(fn) {
  return async (req, res, next) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      if (err instanceof metrics.ReportInputError) return res.status(400).json({ message: err.message });
      next(err);
    }
  };
}

router.get("/overview", requireAdmin, handle(async (req) => {
  return metrics.overviewWithComparison(db, await resolveTenantSchema(req), period(req));
}));

router.get("/breakdown/:by", requireAdmin, handle(async (req) => {
  return metrics.breakdown(db, await resolveTenantSchema(req), period(req), req.params.by);
}));

router.get("/receivables", requireAdmin, handle(async (req) => {
  const schema = await resolveTenantSchema(req);
  const p = period(req);
  const settings = await metrics.branchSettings(db, schema);
  return { period: { from: p.from, to: p.to, ...settings }, ...(await metrics.receivables(db, schema, p, settings.timezone)) };
}));

/**
 * Every branch the user may work in, side by side, plus totals.
 * Masters are excluded: they only ever see their own figures.
 */
router.get("/branches", handle(async (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403);
    return { message: "Forbidden" };
  }
  const p = period(req);
  const tenants = (await listAccessibleTenants(req.auth)).filter((t) => t.is_active);

  const branches = [];
  for (const t of tenants) {
    const schema = quoteIdent(t.schema_name);
    const settings = await metrics.branchSettings(db, schema);
    const o = await metrics.overview(db, schema, p, { timezone: settings.timezone });
    branches.push({ tenant_id: t.id, name: t.name, currency: settings.currency, ...o });
  }

  const sum = (get) => Math.round(branches.reduce((s, b) => s + (get(b) || 0), 0) * 100) / 100;
  const paidVisits = sum((b) => b.paid_visits);
  const totals = {
    income: { gross: sum((b) => b.income.gross), net: sum((b) => b.income.net), vat: sum((b) => b.income.vat) },
    expenses: { gross: sum((b) => b.expenses.gross), net: sum((b) => b.expenses.net) },
    services: {
      completed: sum((b) => b.services.completed),
      rendered_value: sum((b) => b.services.rendered_value),
      cancelled: sum((b) => b.services.cancelled),
    },
    margin: { commissions: sum((b) => b.margin.commissions) },
    unpaid: { count: sum((b) => b.unpaid.count), amount: sum((b) => b.unpaid.amount) },
    avg_ticket: paidVisits ? Math.round((sum((b) => b.income.services) / paidVisits) * 100) / 100 : 0,
    result: sum((b) => b.result),
  };
  const currencies = [...new Set(branches.map((b) => b.currency))];
  return {
    period: { from: p.from, to: p.to },
    currency: currencies.length === 1 ? currencies[0] : null, // null: branches use different currencies, totals not meaningful
    branches,
    totals,
  };
}));

/** A master's own figures. */
router.get("/me", handle(async (req, res) => {
  const schema = await resolveTenantSchema(req);
  const me = await db.query(`SELECT id, name FROM ${schema}.masters WHERE user_id = $1 LIMIT 1`, [req.user.id]);
  if (!me.rows.length) {
    res.status(404);
    return { message: "No master profile for this user in this branch" };
  }
  const p = period(req);
  const masterId = me.rows[0].id;
  const o = await metrics.overviewWithComparison(db, schema, p, { masterId });
  const days = await metrics.byDay(db, schema, p, o.period.timezone, masterId);
  return { master: me.rows[0], ...o, days };
}));

module.exports = router;
