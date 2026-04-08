const express = require('express');
const router = express.Router();
const db = require('../db'); // подключение к базе

// Get all expenses
router.get('/', async (req, res) => {
  const result = await db.query('SELECT id, name FROM salon_demo.expenses ORDER BY id');
  res.json(result.rows);
});

// Create expense
router.post('/', async (req, res) => {
  const { name } = req.body;
  await db.query('INSERT INTO salon_demo.expenses (name) VALUES ($1)', [name]);
  res.status(201).end();
});

// Update expense
router.put('/:id', async (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  await db.query('UPDATE salon_demo.expenses SET name = $1 WHERE id = $2', [name, id]);
  res.status(200).end();
});

// Delete expense
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM salon_demo.expenses WHERE id = $1', [id]);
  res.status(200).end();
});

module.exports = router;