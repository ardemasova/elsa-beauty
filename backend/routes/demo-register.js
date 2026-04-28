const express = require('express');
const bcryptjs = require('bcryptjs');
const db = require('../db');
const { sendDemoAccessEmail } = require('../services/emailService');

const router = express.Router();

// Валидация email
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Генерируем пароль (12 символов, разные типы)
function generatePassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%';
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  const all = uppercase + lowercase + numbers + special;
  for (let i = 0; i < 8; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// POST /api/demo-register
// Регистрируем новой пользователя для демо
router.post('/', async (req, res) => {
  const { email, name, phone } = req.body;

  // Валидация
  if (!email || !name) {
    return res.status(400).json({ 
      success: false,
      message: 'Email and name are required' 
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid email format' 
    });
  }

  if (name.trim().length < 2) {
    return res.status(400).json({ 
      success: false,
      message: 'Name must be at least 2 characters' 
    });
  }

  try {
    // Проверяем, не зарегистрирован ли уже этот email
    const { rows: existingUsers } = await db.query(
      'SELECT id FROM public.users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ 
        success: false,
        message: 'This email is already registered' 
      });
    }

    // Генерируем пароль
    const tempPassword = generatePassword();
    const hashedPassword = await bcryptjs.hash(tempPassword, 10);

    // ID демо тенанта (обычно 1)
    const demoTenantId = process.env.DEMO_TENANT_ID || 1;

    // Создаём пользователя в БД
    const { rows } = await db.query(
      `INSERT INTO public.users (email, name, phone, password_hash, tenant_id, role, created_at)
       VALUES ($1, $2, $3, $4, $5, 'admin', NOW())
       RETURNING id, email, name, phone`,
      [email.toLowerCase(), name.trim(), phone || null, hashedPassword, demoTenantId]
    );

    const newUser = rows[0];

    // Отправляем письмо с доступом
    try {
      await sendDemoAccessEmail(newUser, tempPassword);
    } catch (emailErr) {
      console.error('Email send failed, but user created:', emailErr);
      // Письмо не отправилось, но юзер создан - не блокируем
    }

    console.log(`✅ Demo registration: ${email}`);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Check your email for login credentials.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
      }
    });

  } catch (err) {
    console.error('DEMO REGISTER ERROR:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

module.exports = router;