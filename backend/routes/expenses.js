/**
 * Expense categories of the current branch.
 * Previously these routes had no login check and all salons read and wrote
 * the same salon_demo.expenses table.
 */
const express = require("express");
const db = require("../db");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { requireFeature } = require("../middleware/featureGuard");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();
router.use(authenticateToken, requireFeature("items"));

function cleanName(v) {
  const name = typeof v === "string" ? v.trim() : "";
  return name && name.length <= 255 ? name : null;
}

router.get("/", async (req, res, next) => {
  try {
    const schema = await resolveTenantSchema(req);
    const { rows } = await db.query(`SELECT id, name FROM ${schema}.expenses ORDER BY name`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAdmin, async (req, res, next) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: "name is required (max 255 characters)" });
  try {
    const schema = await resolveTenantSchema(req);
    const { rows } = await db.query(`INSERT INTO ${schema}.expenses (name) VALUES ($1) RETURNING id, name`, [name]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireAdmin, async (req, res, next) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: "name is required (max 255 characters)" });
  try {
    const schema = await resolveTenantSchema(req);
    const { rows } = await db.query(
      `UPDATE ${schema}.expenses SET name = $1 WHERE id = $2 RETURNING id, name`,
      [name, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Expense not found" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "22P02") return res.status(400).json({ message: "Invalid id" });
    next(err);
  }
});

router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const schema = await resolveTenantSchema(req);
    const { rowCount } = await db.query(`DELETE FROM ${schema}.expenses WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: "Expense not found" });
    res.json({ message: "Expense deleted" });
  } catch (err) {
    if (err.code === "23503") return res.status(409).json({ message: "This expense is used in payments and cannot be deleted" });
    if (err.code === "22P02") return res.status(400).json({ message: "Invalid id" });
    next(err);
  }
});

module.exports = router;
