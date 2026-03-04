const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

// =======================
// GET dashboard stats
// =======================
router.get("/stats", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { period = "month" } = req.query;

  try {
    const schema = await resolveTenantSchema(req);

    let dateLabel = "";

    const now = new Date();
    let startDate;
    const endDate = now;

    switch (period) {
      case "day":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateLabel = "Today";
        break;
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        dateLabel = "This Week";
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        dateLabel = "This Month";
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        dateLabel = "This Month";
    }

    // Выручка за период
    const revenueResult = await db.query(
      `
      SELECT COALESCE(SUM(s.price), 0) as total_revenue, COUNT(a.id) as appointment_count
      FROM ${schema}.appointments a
      JOIN ${schema}.services s ON a.service_id = s.id
      WHERE a.start_time >= $1 AND a.start_time < $2 AND a.status != 'cancelled'
      `,
      [startDate, endDate]
    );

    // Новые клиенты за период
    const newClientsResult = await db.query(
      `
      SELECT COUNT(DISTINCT id) as new_clients
      FROM ${schema}.clients
      WHERE created_at >= $1 AND created_at < $2
      `,
      [startDate, endDate]
    );

    // Средний чек
    const avgCheckResult = await db.query(
      `
      SELECT 
        COALESCE(AVG(s.price), 0) as avg_check,
        COUNT(a.id) as total_appointments
      FROM ${schema}.appointments a
      JOIN ${schema}.services s ON a.service_id = s.id
      WHERE a.start_time >= $1 AND a.start_time < $2 AND a.status != 'cancelled'
      `,
      [startDate, endDate]
    );

    res.json({
      period: dateLabel,
      revenue: parseFloat(revenueResult.rows[0].total_revenue),
      appointments: revenueResult.rows[0].appointment_count,
      new_clients: newClientsResult.rows[0].new_clients,
      avg_check: parseFloat(avgCheckResult.rows[0].avg_check),
      total_appointments: avgCheckResult.rows[0].total_appointments,
    });
  } catch (err) {
    console.error("DASHBOARD STATS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET appointments by date range
// =======================
router.get("/appointments", authenticateToken, async (req, res) => {
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
        s.price as service_price
      FROM ${schema}.appointments a
      JOIN ${schema}.masters m ON a.master_id = m.id
      JOIN ${schema}.clients c ON a.client_id = c.id
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
router.get("/master-stats", authenticateToken, async (req, res) => {
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