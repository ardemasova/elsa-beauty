const express = require("express");
const db = require("../db");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

// =======================
// GET company settings
// =======================
router.get("/company", authenticateToken, async (req, res) => {
  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        id,
        name,
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code,
        email,
        phone,
        website,
        currency,
        timezone
      FROM ${schema}.settings
      LIMIT 1
      `
    );

    if (rows.length === 0) {
      return res.json({
        name: "ELSA Beauty",
        address: "",
        vat_number: "",
        bank_name: "",
        bank_account: "",
        bank_code: "",
        email: "",
        phone: "",
        website: "",
        currency: "EUR",
        timezone: "Europe/Madrid",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// UPDATE company settings
// =======================
router.put("/company", authenticateToken, requireAdmin, async (req, res) => {
  const {
    name,
    address,
    vat_number,
    bank_name,
    bank_account,
    bank_code,
    email,
    phone,
    website,
  } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Company name is required" });
  }

  try {
    const schema = await resolveTenantSchema(req);

    // Проверяем есть ли уже запись
    const checkResult = await db.query(`SELECT id FROM ${schema}.settings LIMIT 1`);

    let result;

    if (checkResult.rows.length > 0) {
      // UPDATE
      result = await db.query(
        `
        UPDATE ${schema}.settings
        SET 
          name = $1,
          address = $2,
          vat_number = $3,
          bank_name = $4,
          bank_account = $5,
          bank_code = $6,
          email = $7,
          phone = $8,
          website = $9,
          updated_at = NOW()
        WHERE id = $10
        RETURNING 
          id,
          name,
          address,
          vat_number,
          bank_name,
          bank_account,
          bank_code,
          email,
          phone,
          website
        `,
        [
          name,
          address || "",
          vat_number || "",
          bank_name || "",
          bank_account || "",
          bank_code || "",
          email || "",
          phone || "",
          website || "",
          checkResult.rows[0].id,
        ]
      );
    } else {
      // INSERT
      result = await db.query(
        `
        INSERT INTO ${schema}.settings 
        (name, address, vat_number, bank_name, bank_account, bank_code, email, phone, website, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING 
          id,
          name,
          address,
          vat_number,
          bank_name,
          bank_account,
          bank_code,
          email,
          phone,
          website
        `,
        [
          name,
          address || "",
          vat_number || "",
          bank_name || "",
          bank_account || "",
          bank_code || "",
          email || "",
          phone || "",
          website || "",
        ]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE SETTINGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;