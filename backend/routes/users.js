const express = require('express');
const bcryptjs = require('bcryptjs');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenantContext');

const router = express.Router();

// GET users (admin only)
router.get('/', authenticateToken, tenantContext, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  try {
    const { rows } = await db.query('SELECT id, email, role, tenant_id FROM public.users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('FETCH USERS ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single user by id (admin only) - ДОЛЖЕН БЫТЬ ПОСЛЕ GET /
router.get('/:id', authenticateToken, tenantContext, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  const { id } = req.params;

  try {
    const { rows } = await db.query(
      'SELECT id, email, role, tenant_id FROM public.users WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('FETCH USER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create user (admin only)
router.post('/', authenticateToken, tenantContext, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  const { email, password, role } = req.body;
  if (!email || !password || !role) return res.status(400).json({ message: 'email/password/role required' });

  try {
    const exists = await db.query('SELECT id FROM public.users WHERE email=$1', [email]);
    if (exists.rows.length > 0) return res.status(409).json({ message: 'User already exists' });

    const hash = await bcryptjs.hash(password, 10);
    console.log('JWT user:', req.user);
    const { rows } = await db.query(
      'INSERT INTO public.users (email, password_hash, role, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id, email, role, tenant_id',
      [email, hash, role, req.user.tenantId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('CREATE USER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update user (admin only)
router.put('/:id', authenticateToken, tenantContext, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  const { id } = req.params;
  const { email, password, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ message: 'email and role required' });
  }

  try {
    // Проверяем существует ли пользователь
    const checkUser = await db.query(
      'SELECT id, email FROM public.users WHERE id = $1',
      [id]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Проверяем не занята ли новая email (если она изменена)
    if (checkUser.rows[0].email !== email) {
      const emailExists = await db.query(
        'SELECT id FROM public.users WHERE email = $1 AND id != $2',
        [email, id]
      );

      if (emailExists.rows.length > 0) {
        return res.status(409).json({ message: 'Email already in use' });
      }
    }

    let updateQuery, updateParams;

    // Если пароль предоставлен, обновляем его
    if (password) {
      const hash = await bcryptjs.hash(password, 10);
      updateQuery = `
        UPDATE public.users
        SET email = $1, password_hash = $2, role = $3
        WHERE id = $4
        RETURNING id, email, role, tenant_id
      `;
      updateParams = [email, hash, role, id];
    } else {
      // Без обновления пароля
      updateQuery = `
        UPDATE public.users
        SET email = $1, role = $2
        WHERE id = $3
        RETURNING id, email, role, tenant_id
      `;
      updateParams = [email, role, id];
    }

    const { rows } = await db.query(updateQuery, updateParams);
    res.json(rows[0]);
  } catch (err) {
    console.error('UPDATE USER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE user (admin only)
router.delete('/:id', authenticateToken, tenantContext, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  const { id } = req.params;

  try {
    // Проверяем существует ли пользователь
    const checkUser = await db.query(
      'SELECT id FROM public.users WHERE id = $1',
      [id]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Нельзя удалить самого себя
    if (req.user.id === id) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    // Удаляем пользователя
    await db.query(
      'DELETE FROM public.users WHERE id = $1',
      [id]
    );

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('DELETE USER ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;