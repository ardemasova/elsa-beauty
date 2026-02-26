const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

// JWT генерация
function generateAccessToken(user) {
  return jwt.sign({
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    email: user.email
  }, ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'email/password required' });

  try {
    const { rows } = await db.query('SELECT * FROM public.users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateAccessToken(user);
    res.json({
      token
      
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router ;
