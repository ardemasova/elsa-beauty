const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require('../middleware/featureGuard');

const router = express.Router();

// Purchase cost (and so the salon's margin) is visible to admins only.
router.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (req.method === "GET" && req.user && req.user.role !== "admin") {
      const strip = (o) => (o && typeof o === "object" ? (({ cost, ...rest }) => rest)(o) : o); // eslint-disable-line no-unused-vars
      body = Array.isArray(body) ? body.map(strip) : strip(body);
    }
    return json(body);
  };
  next();
});

// =======================
// GET all items (admin + master)
// supports optional query: ?status=all|active|inactive
// =======================
router.get("/", authenticateToken, requireFeature('items'), async (req, res) => {
  if (!["admin", "master"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const status = String(req.query.status || "all").toLowerCase();

  try {
    const schema = await resolveTenantSchema(req);

    let query = `SELECT * FROM ${schema}.items`;
    const params = [];

    if (status === "active") {
      query += ` WHERE is_active = true`;
    } else if (status === "inactive") {
      query += ` WHERE is_active = false`;
    }

    query += ` ORDER BY name`;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("FETCH ITEMS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET single item by id (admin + master)
// =======================
router.get("/:id", authenticateToken, requireFeature('items'), async (req, res) => {
  if (!["admin", "master"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(`SELECT * FROM ${schema}.items WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH ITEM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// POST create item (admin only)
// =======================
router.post("/", authenticateToken, requireFeature('items'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { name, price, cost, unit, stock_qty, is_active } = req.body;

  if (!name || price == null || cost == null || !unit) {
    return res.status(400).json({
      message: "name, price, cost, unit required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.items (name, price, cost, unit, stock_qty, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        name,
        price,
        cost,
        unit,
        stock_qty == null ? 0 : stock_qty,
        is_active !== false,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE ITEM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// PUT update item (admin only)
// =======================
router.put("/:id", authenticateToken, requireFeature('items'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;
  const { name, price, cost, unit, stock_qty, is_active } = req.body;

  if (!name || price == null || cost == null || !unit) {
    return res.status(400).json({
      message: "name, price, cost, unit required",
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const check = await db.query(`SELECT id FROM ${schema}.items WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    const { rows } = await db.query(
      `
      UPDATE ${schema}.items
      SET name = $1, price = $2, cost = $3, unit = $4, stock_qty = $5, is_active = $6
      WHERE id = $7
      RETURNING *
      `,
      [
        name,
        price,
        cost,
        unit,
        stock_qty == null ? 0 : stock_qty,
        is_active !== false,
        id,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE ITEM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// DELETE item (admin only)
// =======================
router.delete("/:id", authenticateToken, requireFeature('items'), async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const check = await db.query(`SELECT id FROM ${schema}.items WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    await db.query(`DELETE FROM ${schema}.items WHERE id = $1`, [id]);

    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    console.error("DELETE ITEM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;