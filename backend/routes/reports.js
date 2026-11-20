/**
 * AI features (admin only). All figures come from the same calculation as the
 * Reports screen (services/reports/metrics.js), so the assistant never quotes
 * numbers that differ from what the salon sees.
 *
 *   POST /api/reports/admin-chat        { question, from, to }
 *   POST /api/reports/ai-summary        { from, to }
 *   POST /api/reports/schedule-insights { from, to }
 *
 * The old numeric endpoints (/summary, /revenue-by-*, /cogs-*, ...) are gone;
 * use /api/analytics instead.
 */
const express = require("express");
const db = require("../db");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const metrics = require("../services/reports/metrics");
const {
  generateReportSummary,
  generateAdminChatResponse,
  generateScheduleInsights,
} = require("../services/ai/reportSummary");
const scheduleService = require("../services/reports/schedule.service");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require("../middleware/featureGuard");

const router = express.Router();
router.use(authenticateToken, requireFeature("basic_reports"), requireAdmin);

const eur = (v) => `${Number(v || 0).toFixed(2)} EUR`;
const pct = (v) => (v === null || v === undefined ? "n/a" : `${v > 0 ? "+" : ""}${v}%`);

/** Figures for the AI, in the shape the prompt builders expect. */
async function aiStats(schema, from, to) {
  const p = metrics.parsePeriod(from, to);
  const ov = await metrics.overviewWithComparison(db, schema, p);
  const masters = (await metrics.breakdown(db, schema, p, "master")).rows;
  const services = (await metrics.breakdown(db, schema, p, "service")).rows;
  const c = ov.current;
  return {
    period: { from: p.from, to: p.to },
    revenue: { total: c.income.gross, completedAppointments: c.services.completed },
    revenueByMaster: masters.map((m) => ({
      masterId: m.master_id,
      masterName: m.name,
      appointments: m.completed,
      revenue: m.income_gross,
    })),
    cancelled: { count: c.services.cancelled, lostRevenue: c.services.cancelled_value },
    averages: { avgCheck: c.avg_ticket, paymentCount: c.income.payments },
    overview: ov,
    topServices: services.slice(0, 5),
  };
}

/** Plain-text business context for the chat model. */
function contextText(s) {
  const o = s.overview;
  const c = o.current;
  return `Business context (all amounts in EUR; income = payments received by date paid):
- Period: ${s.period.from} to ${s.period.to} (compared with ${o.previous_period.from} to ${o.previous_period.to})
- Money received (incl. VAT): ${eur(c.income.gross)} (${pct(o.change.income_gross)}); without VAT: ${eur(c.income.net)}; VAT: ${eur(c.income.vat)}
- Of which services: ${eur(c.income.services)}, products: ${eur(c.income.items)}; refunds issued: ${eur(c.income.refunds)}
- Expenses without VAT: ${eur(c.expenses.net)}; masters' commissions (estimated): ${eur(c.margin.commissions)}
- Estimated result before taxes: ${eur(c.result)} (${pct(o.change.result)})
- Completed visits: ${c.services.completed} (${pct(o.change.completed)}), hours worked: ${c.services.hours}
- Value of services done: ${eur(c.services.rendered_value)}; average ticket: ${eur(c.avg_ticket)} (${pct(o.change.avg_ticket)})
- Cancelled: ${c.services.cancelled} visits (${eur(c.services.cancelled_value)} not earned)
- Unpaid completed visits: ${c.unpaid.count} (${eur(c.unpaid.amount)})
- Masters: ${s.revenueByMaster.slice(0, 5).map((m) => `${m.masterName} ${eur(m.revenue)} / ${m.appointments} visits`).join("; ") || "none"}
- Top services: ${s.topServices.map((x) => `${x.name} ${x.completed}x ${eur(x.rendered_value)}`).join("; ") || "none"}`;
}

function inputError(err, res) {
  if (err instanceof metrics.ReportInputError) {
    res.status(400).json({ message: err.message });
    return true;
  }
  return false;
}

router.post("/admin-chat", async (req, res) => {
  const { question, from, to } = req.body || {};
  if (typeof question === "string" && question.length > 1000) {
    return res.status(400).json({ message: "Question is too long (max 1000 characters)" });
  }
  if (!question || !from || !to) return res.status(400).json({ message: "question, from and to dates required" });

  try {
    const schema = await resolveTenantSchema(req);
    const stats = await aiStats(schema, from, to);
    const answer = await generateAdminChatResponse(`${contextText(stats)}\n\nUser question: ${question}`);
    res.json({ answer });
  } catch (err) {
    if (inputError(err, res)) return;
    console.error("ADMIN CHAT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/ai-summary", async (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ message: "from and to dates required (format: YYYY-MM-DD)" });
  try {
    const schema = await resolveTenantSchema(req);
    const stats = await aiStats(schema, from, to);
    stats.extraContext = contextText(stats);
    res.json(await generateReportSummary(stats));
  } catch (err) {
    if (inputError(err, res)) return;
    console.error("AI SUMMARY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/schedule-insights", async (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ message: "from and to dates required" });
  try {
    const p = metrics.parsePeriod(from, to);
    const schema = await resolveTenantSchema(req);
    const scheduleData = await scheduleService.getScheduleAnalysis(schema, p.from, p.to);
    res.json(await generateScheduleInsights(scheduleData));
  } catch (err) {
    if (inputError(err, res)) return;
    console.error("SCHEDULE INSIGHTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
