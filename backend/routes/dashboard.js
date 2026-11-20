const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require('../middleware/featureGuard');
const metrics = require("../services/reports/metrics");

const router = express.Router();

// =======================
// GET dashboard stats
// =======================
router.get("/stats", authenticateToken, requireFeature('dashboard'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { period = "month" } = req.query;

  try {
    const schema = await resolveTenantSchema(req);
    const { timezone } = await metrics.branchSettings(db, schema);

    // "Today" in the branch's time zone, not the server's.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const t = new Date(`${today}T00:00:00Z`);
    let from;
    let dateLabel;
    if (period === "day") {
      from = today;
      dateLabel = "Today";
    } else if (period === "week") {
      const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000);
      from = monday.toISOString().slice(0, 10);
      dateLabel = "This Week";
    } else {
      from = `${today.slice(0, 8)}01`;
      dateLabel = "This Month";
    }

    const p = metrics.parsePeriod(from, today);
    const o = await metrics.overview(db, schema, p, { timezone });

    const newClients = await db.query(
      `SELECT count(*)::int AS n FROM ${schema}.clients
        WHERE type = 'customer'
          AND created_at >= ($1::date)::timestamp AT TIME ZONE $3
          AND created_at <  ($2::date + 1)::timestamp AT TIME ZONE $3`,
      [p.from, p.to, timezone]
    );

    // Same numbers as the Reports screen (services/reports/metrics.js).
    res.json({
      period: dateLabel,
      from: p.from,
      to: p.to,
      revenue: o.income.gross, // money received (incl. VAT)
      revenue_net: o.income.net,
      appointments: o.services.completed + o.services.planned,
      completed: o.services.completed,
      new_clients: newClients.rows[0].n,
      avg_check: o.avg_ticket,
      total_appointments: o.services.completed + o.services.planned,
      unpaid: o.unpaid,
    });
  } catch (err) {
    console.error("DASHBOARD STATS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET appointments by date range
// =======================
router.get("/appointments", authenticateToken, requireFeature('dashboard'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ message: "start and end dates required" });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        a.id,
        a.master_id,
        a.client_id,
        a.service_id,
        a.start_time,
        a.end_time,
        a.status,
        a.created_at,
        m.name as master_name,
        m.color as master_color,
        c.name as client_name,
        s.name as service_name,
        COALESCE(a.price, s.price) as service_price
      FROM ${schema}.appointments a
      JOIN ${schema}.masters m ON a.master_id = m.id
      LEFT JOIN ${schema}.clients c ON a.client_id = c.id
      JOIN ${schema}.services s ON a.service_id = s.id
      WHERE a.start_time >= $1 AND a.start_time < $2
      ORDER BY a.start_time ASC
      `,
      [new Date(start), new Date(end)]
    );

    res.json(rows);
  } catch (err) {
    console.error("APPOINTMENTS RANGE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET master stats
// =======================
router.get("/master-stats", authenticateToken, requireFeature('dashboard'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        m.id,
        m.name,
        m.color,
        COUNT(a.id) as total_appointments,
        COALESCE(SUM(s.price), 0) as total_revenue,
        COALESCE(AVG(s.price), 0) as avg_check,
        COUNT(DISTINCT a.client_id) as unique_clients
      FROM ${schema}.masters m
      LEFT JOIN ${schema}.appointments a ON m.id = a.master_id AND a.status != 'cancelled'
      LEFT JOIN ${schema}.services s ON a.service_id = s.id
      GROUP BY m.id, m.name, m.color
      ORDER BY total_revenue DESC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("MASTER STATS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;