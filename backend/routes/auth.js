const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

function isValidSchemaName(v) {
  return typeof v === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(v);
}

// JWT генерация
function generateAccessToken(user, schemaName) {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      schema_name: schemaName,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '1h' }
  );
}

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password, schema_name } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'email/password required' });
  if (!schema_name || !isValidSchemaName(schema_name)) {
    return res.status(400).json({ message: 'schema_name is required and must be a valid Postgres identifier' });
  }

  const schema = schema_name.trim();

  try {
    const { rows } = await db.query(
      `
      SELECT u.*, t.schema_name
      FROM public.users u
      JOIN public.tenants t ON t.id = u.tenant_id
      WHERE u.email = $1 AND t.schema_name = $2
      LIMIT 1
      `,
      [email, schema]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    console.log(`[LOGIN] email=${email} schema=${schema} tenant_id=${user.tenant_id}`);

    const token = generateAccessToken(user, schema);

    return res.json({
      token,
      schema_name: schema,
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;