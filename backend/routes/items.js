const express = require('express');
const router = express.Router();
const { authenticateToken, resolveTenantSchema } = require('../middleware/auth');

const schema = 'YOUR_SCHEMA';  // Replace this with the appropriate schema

// GET all items
router.get('/', authenticateToken, resolveTenantSchema(schema), async (req, res) => {
    try {
        const items = await schema.items.find();
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET item by ID (Admin + Master)
router.get('/:id', authenticateToken, resolveTenantSchema(schema), async (req, res) => {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'master';
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    try {
        const item = await schema.items.findById(req.params.id);
        res.json(item);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST item (Admin only)
router.post('/', authenticateToken, resolveTenantSchema(schema), async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    const item = new schema.items({
        name: req.body.name,
        price: req.body.price,
        cost: req.body.cost,
        unit: req.body.unit,
        stock_qty: req.body.stock_qty,
        is_active: req.body.is_active
    });

    try {
        const newItem = await item.save();
        res.status(201).json(newItem);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// PUT item (Admin only)
router.put('/:id', authenticateToken, resolveTenantSchema(schema), async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    try {
        const item = await schema.items.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(item);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// DELETE item (Admin only)
router.delete('/:id', authenticateToken, resolveTenantSchema(schema), async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    try {
        await schema.items.findByIdAndRemove(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;