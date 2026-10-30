const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require('../middleware/featureGuard');

const router = express.Router();


// =======================
// GET all appointments (optionally by date range)
// =======================
router.get("/", authenticateToken, requireFeature('appointments'), async (req, res) => {
  const role = req.user.role;
  const { start_date, end_date } = req.query;

  try {
    const schema = await resolveTenantSchema(req);

    let query = `
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
        c.name as client_name,
        s.name as service_name,
        s.duration
      FROM ${schema}.appointments a
      JOIN ${schema}.masters m ON a.master_id = m.id
      -- ✅ client может быть NULL для Day Off => LEFT JOIN
      LEFT JOIN ${schema}.clients c ON a.client_id = c.id
      JOIN ${schema}.services s ON a.service_id = s.id
      WHERE 1=1
    `;

    const params = [];

    if (start_date) {
      params.push(start_date);
      query += ` AND a.start_time::date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND a.start_time::date <= $${params.length}`;
    }

    if (!["admin", "master"].includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    query += ` ORDER BY a.start_time DESC`;

    const { rows } = await db.query(query, params);

    // Masters see the whole calendar (to know when colleagues are busy), but
    // client details only for their own appointments.
    if (role === "master") {
      const me = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [req.user.id]);
      const myId = me.rows[0]?.id;
      return res.json(
        rows.map((r) => (r.master_id === myId ? r : { ...r, client_id: null, client_name: null }))
      );
    }

    res.json(rows);
  } catch (err) {
    console.error("FETCH APPOINTMENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET single appointment by id
// =======================
router.get("/:id", authenticateToken, requireFeature('appointments'), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const role = req.user.role;

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
        c.name as client_name,
        s.name as service_name,
        s.duration
      FROM ${schema}.appointments a
      JOIN ${schema}.masters m ON a.master_id = m.id
      -- ✅ client может быть NULL для Day Off => LEFT JOIN
      LEFT JOIN ${schema}.clients c ON a.client_id = c.id
      JOIN ${schema}.services s ON a.service_id = s.id
      WHERE a.id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: "Master profile not found" });
      }

      if (rows[0].master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH APPOINTMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// POST create appointment
// =======================
router.post("/", authenticateToken, requireFeature('appointments'), async (req, res) => {
  const { master_id, client_id, service_id, start_time } = req.body;
  const userId = req.user.userId;
  const role = req.user.role;

  // ✅ client_id is not always required anymore (Day Off)
  if (!master_id || !service_id || !start_time) {
    return res.status(400).json({
      message: "master_id, service_id, start_time required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    console.log("Creating appointment with:", {
      master_id,
      client_id,
      service_id,
      start_time,
      schema,
    });

    // ✅ Load service: duration + name (need name to detect Day Off)
    const serviceResult = await db.query(
      `SELECT duration, name FROM ${schema}.services WHERE id = $1`,
      [service_id]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    const serviceName = String(serviceResult.rows[0].name || "").trim().toLowerCase();
    const isDayOff = serviceName === "day off";

    // ✅ Enforce rule:
    // - Day Off => client_id must be empty/null
    // - Other services => client_id required
    const hasClient =
      client_id !== undefined && client_id !== null && String(client_id).trim() !== "";

    if (isDayOff) {
      if (hasClient) {
        return res.status(400).json({
          message: 'For service "Day Off" client_id must be empty',
        });
      }
    } else {
      if (!hasClient) {
        return res.status(400).json({
          message: "client_id required (except Day Off)",
        });
      }
    }

    // duration expected in minutes
    const durationRaw = serviceResult.rows[0].duration;
    const durationNum = Number(durationRaw);

    console.log("SERVICE DURATION RAW:", durationRaw, "-> num:", durationNum);

    const startDate = new Date(start_time);
    console.log("START PARSE:", start_time, "->", startDate.toString(), "isValid:", !isNaN(startDate));

    if (isNaN(startDate)) {
      return res.status(400).json({ message: "Invalid start_time format", start_time });
    }

    if (!Number.isFinite(durationNum) || durationNum <= 0) {
      return res.status(400).json({ message: "Invalid service duration", duration: durationRaw });
    }

    const start_time_utc = startDate.toISOString();
    const endDate = new Date(startDate.getTime() + durationNum * 60000);
    const end_time_utc = endDate.toISOString();

    console.log("COMPUTED TIMES UTC:", {
      master_id,
      client_id,
      service_id,
      start_time_utc,
      end_time_utc,
    });

    // If master - can only create for self
    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: "Master profile not found" });
      }

      if (master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: "Can only create appointments for yourself" });
      }
    }

    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.appointments (master_id, client_id, service_id, start_time, end_time, status)
      VALUES ($1, $2, $3, $4, $5, 'planned')
      RETURNING 
        id,
        master_id,
        client_id,
        service_id,
        start_time,
        end_time,
        status,
        created_at
      `,
      // ✅ if Day Off -> store NULL
      [master_id, isDayOff ? null : client_id, service_id, start_time_utc, end_time_utc]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23P01") {
      return res.status(409).json({ message: "This master already has an appointment at that time" });
    }
    console.error("CREATE APPOINTMENT ERROR:", err);
    console.error("Error message:", err.message);
    console.error("Error code:", err.code);
    console.error("Error constraint:", err.constraint);

    if (err.constraint === "appointments_no_overlap") {
      return res.status(409).json({ message: "Appointment overlaps existing booking" });
    }

    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// PUT update appointment
// =======================
router.put("/:id", authenticateToken, requireFeature('appointments'), async (req, res) => {
  const { id } = req.params;
  const { master_id, client_id, service_id, start_time, status } = req.body;
  const userId = req.user.userId;
  const role = req.user.role;

  // ✅ client_id is not always required anymore (Day Off)
  if (!master_id || !service_id || !start_time) {
    return res.status(400).json({
      message: "master_id, service_id, start_time required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const checkAppointment = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [id]);

    if (checkAppointment.rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: "Master profile not found" });
      }

      if (checkAppointment.rows[0].master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: "Can only edit your own appointments" });
      }
      if (master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: "Masters cannot reassign appointments to someone else" });
      }
    }

    // ✅ load service name + duration
    const serviceResult = await db.query(`SELECT duration, name FROM ${schema}.services WHERE id = $1`, [service_id]);

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    const serviceName = String(serviceResult.rows[0].name || "").trim().toLowerCase();
    const isDayOff = serviceName === "day off";

    const hasClient =
      client_id !== undefined && client_id !== null && String(client_id).trim() !== "";

    if (isDayOff) {
      if (hasClient) {
        return res.status(400).json({ message: 'For service "Day Off" client_id must be empty' });
      }
    } else {
      if (!hasClient) {
        return res.status(400).json({ message: "client_id required (except Day Off)" });
      }
    }

    const durationRaw = serviceResult.rows[0].duration;
    const durationNum = Number(durationRaw);

    if (!Number.isFinite(durationNum) || durationNum <= 0) {
      return res.status(400).json({ message: "Invalid service duration", duration: durationRaw });
    }

    const startDate = new Date(start_time);
    if (isNaN(startDate)) {
      return res.status(400).json({ message: "Invalid start_time format", start_time });
    }

    const start_time_utc = startDate.toISOString();
    const endDate = new Date(startDate.getTime() + durationNum * 60000);
    const end_time_utc = endDate.toISOString();

    const { rows } = await db.query(
      `
      UPDATE ${schema}.appointments
      SET master_id = $1, client_id = $2, service_id = $3, start_time = $4, end_time = $5, status = $6
      WHERE id = $7
      RETURNING 
        id,
        master_id,
        client_id,
        service_id,
        start_time,
        end_time,
        status,
        created_at
      `,
      [
        master_id,
        isDayOff ? null : client_id,
        service_id,
        start_time_utc,
        end_time_utc,
        status || "planned",
        id,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23P01") {
      return res.status(409).json({ message: "This master already has an appointment at that time" });
    }
    console.error("UPDATE APPOINTMENT ERROR:", err);

    if (err.constraint === "appointments_no_overlap") {
      return res.status(409).json({ message: "Appointment overlaps existing booking" });
    }

    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// DELETE appointment
// =======================
router.delete("/:id", authenticateToken, requireFeature('appointments'), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const role = req.user.role;

  try {
    const schema = await resolveTenantSchema(req);

    const checkAppointment = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [id]);

    if (checkAppointment.rows.length === 0) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: "Master profile not found" });
      }

      if (checkAppointment.rows[0].master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: "Can only delete your own appointments" });
      }
    }

    await db.query(`DELETE FROM ${schema}.appointments WHERE id = $1`, [id]);

    res.json({ message: "Appointment deleted successfully" });
  } catch (err) {
    console.error("DELETE APPOINTMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;