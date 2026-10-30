const express = require("express");
const db = require("../db");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const reportsService = require("../services/reports/reports.service");
const {
  generateReportSummary,
  generateAdminChatResponse,
  generateScheduleInsights,
} = require("../services/ai/reportSummary");
const scheduleService = require("../services/reports/schedule.service");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require('../middleware/featureGuard');

const router = express.Router();

// =======================
// POST Admin Chat
// =======================
router.post("/admin-chat", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { question, from, to } = req.body;

  if (typeof question === "string" && question.length > 1000) {
    return res.status(400).json({ message: "Question is too long (max 1000 characters)" });
  }
  if (!question || !from || !to) {
    return res.status(400).json({
      message: "question, from and to dates required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    console.log(`Admin chat question: ${question}`);

    const stats = await reportsService.getReportSummaryStats(schema, from, to);

    const context = `
Business Context:
- Period: ${from} to ${to}
- Total Revenue: $${stats.revenue.total.toFixed(2)}
- Completed Appointments: ${stats.revenue.completedAppointments}
- Average Check: $${stats.averages.avgCheck.toFixed(2)}
- Cancelled: ${stats.cancelled.count} (Lost: $${stats.cancelled.lostRevenue.toFixed(2)})
- Top Masters: ${stats.revenueByMaster
      .slice(0, 3)
      .map((m) => `${m.masterName} ($${m.revenue.toFixed(2)})`)
      .join(", ")}

User Question: ${question}`;

    const answer = await generateAdminChatResponse(context);

    res.json({ answer });
  } catch (err) {
    console.error("ADMIN CHAT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// POST Schedule Insights
// =======================
router.post("/schedule-insights", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    console.log(`Schedule insights for period ${from} to ${to}`);

    const scheduleData = await scheduleService.getScheduleAnalysis(schema, from, to);
    const insights = await generateScheduleInsights(scheduleData);

    res.json(insights);
  } catch (err) {
    console.error("SCHEDULE INSIGHTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// POST AI report summary
// =======================
router.post("/ai-summary", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    console.log(`Generating AI summary for period ${from} to ${to}`);

    const stats = await reportsService.getReportSummaryStats(schema, from, to);
    const summary = await generateReportSummary(stats);

    res.json(summary);
  } catch (err) {
    console.error("AI SUMMARY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET summary all
// =======================
router.get("/summary-all", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    const stats = await reportsService.getReportSummaryStats(schema, from, to);
    res.json(stats);
  } catch (err) {
    console.error("GET SUMMARY ALL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET summary statistics
// =======================
router.get("/summary", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    const stats = await reportsService.getSummaryStats(schema, from, to);
    res.json(stats);
  } catch (err) {
    console.error("GET SUMMARY STATS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET cancelled appointments
// =======================
router.get("/cancelled", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    const data = await reportsService.getCancelledStats(schema, from, to);
    res.json(data);
  } catch (err) {
    console.error("GET CANCELLED STATS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET average check
// =======================
router.get("/average-check", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    const data = await reportsService.getAverageCheck(schema, from, to);
    res.json(data);
  } catch (err) {
    console.error("GET AVERAGE CHECK ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET master performance
// =======================
router.get("/master-performance", authenticateToken, requireFeature('basic_reports'), async (req, res) => {
  let { masterId } = req.query;

  try {
    const schema = await resolveTenantSchema(req);

    // Masters only ever see their own figures.
    if (req.user.role !== "admin") {
      const own = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [req.user.id]);
      if (!own.rows.length) return res.json([]);
      masterId = own.rows[0].id;
    }

    let query = `
      SELECT 
        mp.master_id, 
        mp.master_name, 
        mp.revenue_generated, 
        mp.commission, 
        mp.gross_margin, 
        mp.net_margin, 
        mp.appointments_completed, 
        mp.appointments_cancelled, 
        mp.appointments_planned, 
        mp.hours_worked, 
        mp.revenue_per_hour, 
        mp.margin_percent, 
        mp.net_margin_percent,
        m.photo_url
      FROM ${schema}.master_performance mp
      LEFT JOIN ${schema}.masters m ON mp.master_id = m.id
      WHERE 1=1
    `;

    const params = [];

    if (masterId) {
      query += ` AND mp.master_id = $${params.length + 1}`;
      params.push(masterId);
    }

    query += ` ORDER BY revenue_generated DESC`;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("MASTER PERFORMANCE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET revenue by day
// =======================
router.get("/revenue-by-day", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        revenue_date,
        revenue,
        appointments_completed
      FROM ${schema}.revenue_by_day
      WHERE revenue_date >= $1 AND revenue_date <= $2
      ORDER BY revenue_date DESC
      `,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET REVENUE BY DAY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET revenue by master
// =======================
router.get("/revenue-by-master", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        m.id AS master_id,
        m.name AS master_name,
        SUM(s.price) AS revenue,
        COUNT(a.id) AS appointments_completed
      FROM ${schema}.appointments a
      JOIN ${schema}.services s ON s.id = a.service_id
      JOIN ${schema}.masters m ON m.id = a.master_id
      WHERE a.status = 'completed'
        AND DATE(a.start_time) >= $1 
        AND DATE(a.start_time) <= $2
      GROUP BY m.id, m.name
      ORDER BY revenue DESC
      `,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET REVENUE BY MASTER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET revenue by service
// =======================
router.get("/revenue-by-service", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        s.id AS service_id,
        s.name AS service_name,
        SUM(s.price) AS revenue,
        COUNT(a.id) AS times_sold
      FROM ${schema}.appointments a
      JOIN ${schema}.services s ON s.id = a.service_id
      WHERE a.status = 'completed'
        AND DATE(a.start_time) >= $1 
        AND DATE(a.start_time) <= $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
      `,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET REVENUE BY SERVICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET COGS Report
// =======================
router.get("/cogs-report", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to, groupBy } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    let groupByClause;

    // Определяем группировку
    if (groupBy === "master") {
      groupByClause = "master_name";
    } else if (groupBy === "service") {
      groupByClause = "service_name";
    } else {
      // По умолчанию по дате
      groupByClause = "appointment_date";
    }

    const query = `
      SELECT 
        ${groupByClause === "appointment_date" ? "appointment_date" : groupByClause} AS group_name,
        COUNT(*) AS transactions,
        SUM(revenue)::numeric AS revenue,
        SUM(cogs)::numeric AS cogs,
        SUM(gross_margin)::numeric AS gross_margin,
        SUM(net_margin)::numeric AS net_margin,
        ROUND(AVG(gross_margin_percent)::numeric, 2) AS avg_gross_margin_percent,
        ROUND(AVG(net_margin_percent)::numeric, 2) AS avg_net_margin_percent
      FROM ${schema}.cogs_report
      WHERE appointment_date >= $1 AND appointment_date <= $2
      GROUP BY ${groupByClause}
      ORDER BY 
        ${groupByClause === "appointment_date" ? "appointment_date DESC" : "revenue DESC"}
    `;

    const { rows } = await db.query(query, [from, to]);
    res.json(rows);
  } catch (err) {
    console.error("GET COGS REPORT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET COGS Summary
// =======================
router.get("/cogs-summary", authenticateToken, requireFeature('basic_reports'), requireAdmin, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required (format: YYYY-MM-DD)",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        COUNT(*) AS total_transactions,
        SUM(revenue)::numeric AS total_revenue,
        SUM(cogs)::numeric AS total_cogs,
        SUM(gross_margin)::numeric AS total_gross_margin,
        SUM(net_margin)::numeric AS total_net_margin,
        ROUND(AVG(gross_margin_percent)::numeric, 2) AS avg_gross_margin_percent,
        ROUND(AVG(net_margin_percent)::numeric, 2) AS avg_net_margin_percent
      FROM ${schema}.cogs_report
      WHERE appointment_date >= $1 AND appointment_date <= $2
      `,
      [from, to]
    );
    res.json(rows[0] || {});
  } catch (err) {
    console.error("GET COGS SUMMARY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;