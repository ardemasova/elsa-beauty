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
        invoice_prefix,
        to_char(work_start, 'HH24:MI') AS work_start,
        to_char(work_end, 'HH24:MI') AS work_end,
        work_days,
        revenue_goal_month
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
        work_start: "10:00",
        work_end: "20:00",
        work_days: [1, 2, 3, 4, 5, 6],
        revenue_goal_month: null,
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

  // Opening hours and the monthly revenue goal (dashboard). All optional.
  const hours = {};
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (req.body.work_start !== undefined || req.body.work_end !== undefined) {
    const ws = String(req.body.work_start || "");
    const we = String(req.body.work_end || "");
    if (!TIME_RE.test(ws) || !TIME_RE.test(we) || we <= ws) {
      return res.status(400).json({ message: "Opening hours: give start and end as HH:MM, end after start" });
    }
    hours.work_start = ws;
    hours.work_end = we;
  }
  if (req.body.work_days !== undefined) {
    const d = req.body.work_days;
    if (!Array.isArray(d) || !d.length || d.length > 7 || !d.every((x) => Number.isInteger(x) && x >= 1 && x <= 7)) {
      return res.status(400).json({ message: "Working days: a list of weekdays 1 (Monday) to 7 (Sunday)" });
    }
    hours.work_days = [...new Set(d)].sort();
  }
  if (req.body.revenue_goal_month !== undefined) {
    const g = req.body.revenue_goal_month;
    if (g !== null && g !== "" && !(Number(g) >= 0 && Number(g) < 1e9)) {
      return res.status(400).json({ message: "Revenue goal must be a positive amount" });
    }
    hours.revenue_goal_month = g === null || g === "" ? null : Math.round(Number(g) * 100) / 100;
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

    const keys = Object.keys(hours);
    if (keys.length) {
      await db.query(
        `UPDATE ${schema}.settings SET ${keys.map((k, n) => `${k} = $${n + 1}`).join(", ")} WHERE id = $${keys.length + 1}`,
        [...keys.map((k) => hours[k]), result.rows[0].id]
      );
      Object.assign(result.rows[0], hours);
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