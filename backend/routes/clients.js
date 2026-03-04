const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

// =======================
// GET all partners (with optional filter by type)
// =======================
router.get("/", authenticateToken, async (req, res) => {


  const { type } = req.query; // 'customer', 'vendor', or undefined for all

  try {
    const schema = await resolveTenantSchema(req);

    let query = `
      SELECT 
        id, 
        name, 
        type,
        phone, 
        email, 
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code,
        created_at 
      FROM ${schema}.clients
    `;

    if (type) {
      query += ` WHERE type = $1 ORDER BY created_at DESC`;
      const { rows } = await db.query(query, [type]);
      return res.json(rows);
    }

    query += ` ORDER BY created_at DESC`;
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error("FETCH PARTNERS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET single partner by id
// =======================
router.get("/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        id, 
        name, 
        type,
        phone, 
        email, 
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code,
        created_at 
      FROM ${schema}.clients 
      WHERE id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH PARTNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// POST create partner
// =======================
router.post("/", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const {
    name,
    type,
    phone,
    email,
    address,
    vat_number,
    bank_name,
    bank_account,
    bank_code,
  } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      message: 'name and type (customer/vendor) required',
    });
  }

  if (!["customer", "vendor"].includes(type)) {
    return res.status(400).json({
      message: 'type must be "customer" or "vendor"',
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    // Проверяем не существует ли партнер с таким номером телефона
    if (phone) {
      const exists = await db.query(
        `SELECT id FROM ${schema}.clients WHERE phone = $1`,
        [phone]
      );

      if (exists.rows.length > 0) {
        return res
          .status(409)
          .json({ message: "Partner with this phone already exists" });
      }
    }

    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.clients (
        name, 
        type,
        phone, 
        email, 
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id, 
        name, 
        type,
        phone, 
        email, 
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code,
        created_at
      `,
      [
        name,
        type,
        phone || null,
        email || null,
        address || null,
        vat_number || null,
        bank_name || null,
        bank_account || null,
        bank_code || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE PARTNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// PUT update partner
// =======================
router.put("/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;
  const {
    name,
    type,
    phone,
    email,
    address,
    vat_number,
    bank_name,
    bank_account,
    bank_code,
  } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      message: "name and type required",
    });
  }

  if (!["customer", "vendor"].includes(type)) {
    return res.status(400).json({
      message: 'type must be "customer" or "vendor"',
    });
  }

  try {
    const schema = await resolveTenantSchema(req);

    // Проверяем существует ли партнер
    const checkPartner = await db.query(
      `SELECT id, phone FROM ${schema}.clients WHERE id = $1`,
      [id]
    );

    if (checkPartner.rows.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    // Проверяем не занят ли новый номер телефона
    if (phone && checkPartner.rows[0].phone !== phone) {
      const phoneExists = await db.query(
        `SELECT id FROM ${schema}.clients WHERE phone = $1 AND id != $2`,
        [phone, id]
      );

      if (phoneExists.rows.length > 0) {
        return res.status(409).json({ message: "Phone number already in use" });
      }
    }

    // Обновляем партне��а
    const { rows } = await db.query(
      `
      UPDATE ${schema}.clients
      SET 
        name = $1, 
        type = $2,
        phone = $3, 
        email = $4, 
        address = $5,
        vat_number = $6,
        bank_name = $7,
        bank_account = $8,
        bank_code = $9
      WHERE id = $10
      RETURNING 
        id, 
        name, 
        type,
        phone, 
        email, 
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code,
        created_at
      `,
      [
        name,
        type,
        phone || null,
        email || null,
        address || null,
        vat_number || null,
        bank_name || null,
        bank_account || null,
        bank_code || null,
        id,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE PARTNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// DELETE partner
// =======================
router.delete("/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const checkPartner = await db.query(
      `SELECT id FROM ${schema}.clients WHERE id = $1`,
      [id]
    );

    if (checkPartner.rows.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    await db.query(`DELETE FROM ${schema}.clients WHERE id = $1`, [id]);

    res.json({ message: "Partner deleted successfully" });
  } catch (err) {
    console.error("DELETE PARTNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;