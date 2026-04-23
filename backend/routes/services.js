const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require('../middleware/featureGuard');

const router = express.Router();

// =======================
// GET all services (admin + master)
// =======================
router.get("/", authenticateToken, requireFeature('items'), async (req, res) => {
  // ✅ allow master to read services (needed for Dashboard / Appointments UI)
  if (!["admin", "master"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const schema = await resolveTenantSchema(req);
    const { rows } = await db.query(
      `SELECT * FROM ${schema}.services ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error("FETCH SERVICES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET single service by id (admin + master)
// =======================
router.get("/:id", authenticateToken, requireFeature('items'), async (req, res) => {
  if (!["admin", "master"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `SELECT * FROM ${schema}.services WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH SERVICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// POST create service (admin only)
// =======================
router.post("/", authenticateToken, requireFeature('items'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { name, duration, price, cost, is_active } = req.body;

  if (!name || duration == null || price == null || cost == null) {
    return res.status(400).json({
      message: "name, duration, price, cost required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.services (name, duration, price, cost, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [name, duration, price, cost, is_active !== false]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE SERVICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// PUT update service (admin only)
// =======================
router.put("/:id", authenticateToken, requireFeature('items'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;
  const { name, duration, price, cost, is_active } = req.body;

  if (!name || duration == null || price == null || cost == null) {
    return res.status(400).json({
      message: "name, duration, price, cost required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    // Проверяем существует ли услуга
    const checkService = await db.query(
      `SELECT id FROM ${schema}.services WHERE id = $1`,
      [id]
    );

    if (checkService.rows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Обновляем услугу
    const { rows } = await db.query(
      `
      UPDATE ${schema}.services
      SET name = $1, duration = $2, price = $3, cost = $4, is_active = $5
      WHERE id = $6
      RETURNING *
      `,
      [name, duration, price, cost, is_active !== false, id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE SERVICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// DELETE service (admin only)
// =======================
router.delete("/:id", authenticateToken, requireFeature('items'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    // Проверяем существует ли услуга
    const checkService = await db.query(
      `SELECT id FROM ${schema}.services WHERE id = $1`,
      [id]
    );

    if (checkService.rows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Удаляем услугу
    await db.query(`DELETE FROM ${schema}.services WHERE id = $1`, [id]);

    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    console.error("DELETE SERVICE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;