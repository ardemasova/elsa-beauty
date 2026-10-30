const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT id, percent, is_default, created_at
      FROM ${schema}.vat
      ORDER BY (is_default = 'Y') DESC, percent ASC, created_at DESC
      `
    );

    return res.json(rows);
  } catch (err) {
    console.error("FETCH VAT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  const { percent, is_default } = req.body;

  const p = Number(percent);
  if (Number.isNaN(p) || p < 0 || p > 100) {
    return res.status(400).json({ message: "percent must be a number between 0 and 100" });
  }

  const def = is_default === "Y" ? "Y" : "N";

  try {
    const schema = await resolveTenantSchema(req);

    const rows = await db.withTransaction(async (client) => {
      if (def === "Y") {
        await client.query(`UPDATE ${schema}.vat SET is_default = 'N' WHERE is_default = 'Y'`);
      }
      const r = await client.query(
        `INSERT INTO ${schema}.vat (percent, is_default) VALUES ($1, $2)
         RETURNING id, percent, is_default, created_at`,
        [p, def]
      );
      return r.rows;
    });

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE VAT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Set default (admin only)
router.patch("/:id/default", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const rows = await db.withTransaction(async (client) => {
      const exists = await client.query(`SELECT id FROM ${schema}.vat WHERE id = $1`, [id]);
      if (exists.rows.length === 0) return null;
      await client.query(`UPDATE ${schema}.vat SET is_default = 'N' WHERE is_default = 'Y' AND id != $1`, [id]);
      const r = await client.query(
        `UPDATE ${schema}.vat SET is_default = 'Y' WHERE id = $1 RETURNING id, percent, is_default, created_at`,
        [id]
      );
      return r.rows;
    });
    if (!rows) return res.status(404).json({ message: "VAT rate not found" });

    return res.json(rows[0]);
  } catch (err) {
    console.error("SET DEFAULT VAT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Delete (admin only) - default cannot be deleted
router.delete("/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(`SELECT id, is_default FROM ${schema}.vat WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ message: "VAT rate not found" });

    if (rows[0].is_default === "Y") {
      return res.status(409).json({ message: "Cannot delete default VAT rate. Set another default first." });
    }

    await db.query(`DELETE FROM ${schema}.vat WHERE id = $1`, [id]);
    return res.json({ message: "VAT rate deleted" });
  } catch (err) {
    console.error("DELETE VAT ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;