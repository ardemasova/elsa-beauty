const express = require("express");
const db = require("../db");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { usedPrefixes } = require("../services/provisioning");
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
        timezone,
        invoice_prefix
      FROM ${schema}.settings
      ORDER BY created_at NULLS LAST
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
        invoice_prefix: "",
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

  // Invoice series prefix (e.g. "CEN" -> CEN-F-2026-0001). Optional; only
  // letters and digits so numbers stay unambiguous.
  const prefixGiven = req.body.invoice_prefix !== undefined;
  const invoicePrefix = String(req.body.invoice_prefix ?? "").trim().toUpperCase();
  if (prefixGiven && !/^[A-Z0-9]{0,6}$/.test(invoicePrefix)) {
    return res.status(400).json({ message: "Invoice prefix: up to 6 letters or digits" });
  }

  try {
    const schema = await resolveTenantSchema(req);

    if (prefixGiven) {
      const cur = await db.query(`SELECT invoice_prefix FROM ${schema}.settings ORDER BY created_at NULLS LAST LIMIT 1`);
      const current = (cur.rows[0]?.invoice_prefix || "").toUpperCase();
      if (invoicePrefix !== current) {
        // Branches of one company share a NIF: their series must differ.
        const others = await db.query(
          `SELECT count(*)::int AS n FROM public.tenants WHERE account_id = $1 AND is_active AND id <> $2`,
          [req.user.accountId, req.tenant.id]
        );
        if (!invoicePrefix && others.rows[0].n > 0) {
          return res.status(400).json({ message: "With several branches every branch needs its own invoice prefix" });
        }
        if (invoicePrefix && (await usedPrefixes(db, req.user.accountId, req.tenant.schema)).has(invoicePrefix)) {
          return res.status(409).json({ message: `Prefix ${invoicePrefix} is already used by another branch` });
        }
        // A series cannot change in the middle of a year once invoices exist.
        const issued = await db.query(
          `SELECT count(*)::int AS n FROM ${schema}.payments
            WHERE document_number IS NOT NULL
              AND date_trunc('year', paid_at AT TIME ZONE 'Europe/Madrid') = date_trunc('year', now() AT TIME ZONE 'Europe/Madrid')`
        );
        if (issued.rows[0].n > 0) {
          return res.status(409).json({
            message: "Invoices have already been issued this year with the current prefix. It can be changed from 1 January.",
          });
        }
      }
    }

    // Проверяем есть ли уже запись
    const checkResult = await db.query(`SELECT id FROM ${schema}.settings ORDER BY created_at NULLS LAST LIMIT 1`);

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

    if (prefixGiven) {
      await db.query(`UPDATE ${schema}.settings SET invoice_prefix = $1 WHERE id = $2`, [invoicePrefix || null, result.rows[0].id]);
      result.rows[0].invoice_prefix = invoicePrefix;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE SETTINGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;