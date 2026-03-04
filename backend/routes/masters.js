const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

// =======================
// GET all masters (admin only)
// =======================
router.get('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const schema = await resolveTenantSchema(req);
    const { rows } = await db.query(`SELECT * FROM ${schema}.masters ORDER BY id`);
    res.json(rows);
  } catch (err) {
    console.error('FETCH MASTERS ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// GET single master by id (admin only)
// =======================
router.get('/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);
    const { rows } = await db.query(`SELECT * FROM ${schema}.masters WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Master not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('FETCH MASTER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// POST create master (admin only)
// =======================
router.post('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { name, commission, userId } = req.body;

  if (!name || commission == null || !userId) {
    return res.status(400).json({ message: 'userId, name, commission required' });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.masters (name, commission, user_id)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [name, commission, userId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('CREATE MASTER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// PUT update master (admin only)
// =======================
router.put('/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;
  const { name, commission, userId } = req.body;

  if (!name || commission == null || !userId) {
    return res.status(400).json({ message: 'userId, name, commission required' });
  }

  try {
    const schema = await resolveTenantSchema(req);

    const checkMaster = await db.query(`SELECT id FROM ${schema}.masters WHERE id = $1`, [id]);
    if (checkMaster.rows.length === 0) {
      return res.status(404).json({ message: 'Master not found' });
    }

    const { rows } = await db.query(
      `
      UPDATE ${schema}.masters
      SET name = $1, commission = $2, user_id = $3
      WHERE id = $4
      RETURNING *
      `,
      [name, commission, userId, id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('UPDATE MASTER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// DELETE master (admin only)
// =======================
router.delete('/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { id } = req.params;

  try {
    const schema = await resolveTenantSchema(req);

    const checkMaster = await db.query(`SELECT id FROM ${schema}.masters WHERE id = $1`, [id]);
    if (checkMaster.rows.length === 0) {
      return res.status(404).json({ message: 'Master not found' });
    }

    await db.query(`DELETE FROM ${schema}.masters WHERE id = $1`, [id]);
    res.json({ message: 'Master deleted successfully' });
  } catch (err) {
    console.error('DELETE MASTER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;