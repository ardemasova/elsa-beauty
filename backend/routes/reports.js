const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const reportsService = require("../services/reports/reports.service");
const {
  generateReportSummary,
  generateAdminChatResponse,
  generateScheduleInsights,
} = require("../services/ai/reportSummary");
const scheduleService = require("../services/reports/schedule.service");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

// =======================
// POST Admin Chat
// =======================
router.post("/admin-chat", authenticateToken, async (req, res) => {
  const { question, from, to } = req.body;

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
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =======================
// POST Schedule Insights
// =======================
router.post("/schedule-insights", authenticateToken, async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({
      message: "from and to dates required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);
    console.log(`Schedule insights for period ${from} to ${to}`);

    const scheduleData = await reportsService.getScheduleAnalysis(schema, from, to);
    const insights = await generateScheduleInsights(scheduleData);

    res.json(insights);
  } catch (err) {
    console.error("SCHEDULE INSIGHTS ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =======================
// POST AI report summary
// =======================
router.post("/ai-summary", authenticateToken, async (req, res) => {
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
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// GET summary all
// =======================
router.get("/summary-all", authenticateToken, async (req, res) => {
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
router.get("/summary", authenticateToken, async (req, res) => {
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
router.get("/cancelled", authenticateToken, async (req, res) => {
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
router.get("/average-check", authenticateToken, async (req, res) => {
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
router.get("/master-performance", authenticateToken, async (req, res) => {
  const { startDate, endDate, masterId } = req.query;

  try {
    const schema = await resolveTenantSchema(req);

    let query = `
      SELECT 
        master_id, 
        master_name, 
        revenue_generated, 
        commission, 
        gross_margin, 
        net_margin, 
        appointments_completed, 
        appointments_cancelled, 
        appointments_planned, 
        hours_worked, 
        revenue_per_hour, 
        margin_percent, 
        net_margin_percent
      FROM ${schema}.master_performance
      WHERE 1=1
    `;

    const params = [];

    if (masterId) {
      query += ` AND master_id = $${params.length + 1}`;
      params.push(masterId);
    }

    query += ` ORDER BY revenue_generated DESC`;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("MASTER PERFORMANCE ERROR:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// GET revenue by day
// =======================
router.get("/revenue-by-day", authenticateToken, async (req, res) => {
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
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// GET revenue by master
// =======================
router.get("/revenue-by-master", authenticateToken, async (req, res) => {
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
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// GET revenue by service
// =======================
router.get("/revenue-by-service", authenticateToken, async (req, res) => {
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
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// GET COGS Report
// =======================
router.get("/cogs-report", authenticateToken, async (req, res) => {
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
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// =======================
// GET COGS Summary
// =======================
router.get("/cogs-summary", authenticateToken, async (req, res) => {
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
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

module.exports = router;