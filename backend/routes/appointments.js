const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const TENANT_SCHEMAS = {
  "0575e7ca-a781-46ad-9b2d-0a85acb4a5d2": "salon_demo",
};

// Получаем схему текущего tenant-а
function tenantSchema(tenantId) {
  const schema = TENANT_SCHEMAS[tenantId];
  if (!schema) throw new Error(`No schema mapped for tenantId ${tenantId}`);
  return `"${schema}"`;
}

// =======================
// GET all appointments
// =======================
router.get('/', authenticateToken, async (req, res) => {
  const schema = tenantSchema(req.user.tenantId);
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let query = `
      SELECT 
        a.id,
        a.master_id,
        a.client_id,
        a.service_id,
        a.start_time,
        a.end_time,
        a.status,
        a.created_at,
        m.name as master_name,
        c.name as client_name,
        s.name as service_name,
        s.duration
      FROM ${schema}.appointments a
      JOIN ${schema}.masters m ON a.master_id = m.id
      JOIN ${schema}.clients c ON a.client_id = c.id
      JOIN ${schema}.services s ON a.service_id = s.id
    `;

    // Если мастер - показываем только его записи
    if (role === 'master') {
      // Ищем мастера по user_id
      const masterResult = await db.query(
        `SELECT id FROM ${schema}.masters WHERE user_id = $1`,
        [userId]
      );

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: 'Master profile not found' });
      }

      const masterId = masterResult.rows[0].id;
      query += ` WHERE a.master_id = $1 ORDER BY a.start_time DESC`;
      const { rows } = await db.query(query, [masterId]);
      return res.json(rows);
    }

    // Админ видит все записи
    query += ` ORDER BY a.start_time DESC`;
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error('FETCH APPOINTMENTS ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// GET single appointment by id
// =======================
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const schema = tenantSchema(req.user.tenantId);
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const { rows } = await db.query(
      `
      SELECT 
        a.id,
        a.master_id,
        a.client_id,
        a.service_id,
        a.start_time,
        a.end_time,
        a.status,
        a.created_at,
        m.name as master_name,
        c.name as client_name,
        s.name as service_name,
        s.duration
      FROM ${schema}.appointments a
      JOIN ${schema}.masters m ON a.master_id = m.id
      JOIN ${schema}.clients c ON a.client_id = c.id
      JOIN ${schema}.services s ON a.service_id = s.id
      WHERE a.id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Если мастер - проверяем что это его запись
    if (role === 'master') {
      const masterResult = await db.query(
        `SELECT id FROM ${schema}.masters WHERE user_id = $1`,
        [userId]
      );

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: 'Master profile not found' });
      }

      if (rows[0].master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('FETCH APPOINTMENT ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// POST create appointment
// =======================
router.post('/', authenticateToken, async (req, res) => {
  const { master_id, client_id, service_id, start_time } = req.body;
  const schema = tenantSchema(req.user.tenantId);
  const userId = req.user.id;
  const role = req.user.role;

  if (!master_id || !client_id || !service_id || !start_time) {
    return res.status(400).json({
      message: 'master_id, client_id, service_id, start_time required',
    });
  }

  try {
    console.log('Creating appointment with:', { master_id, client_id, service_id, start_time });

    // Получаем продолжительность услуги
    const serviceResult = await db.query(
      `SELECT duration FROM ${schema}.services WHERE id = $1`,
      [service_id]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }

    const duration = serviceResult.rows[0].duration;
    console.log('Service duration:', duration);

    // Рассчитываем end_time на основе start_time + duration (в минутах)
    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const end_time = endDate.toISOString();

    console.log('Start time:', start_time);
    console.log('End time:', end_time);

    // Если мастер - проверяем что это его запись
    if (role === 'master') {
      const masterResult = await db.query(
        `SELECT id FROM ${schema}.masters WHERE user_id = $1`,
        [userId]
      );

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: 'Master profile not found' });
      }

      if (master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: 'Can only create appointments for yourself' });
      }
    }

    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.appointments (master_id, client_id, service_id, start_time, end_time, status)
      VALUES ($1, $2, $3, $4, $5, 'planned')
      RETURNING 
        id,
        master_id,
        client_id,
        service_id,
        start_time,
        end_time,
        status,
        created_at
      `,
      [master_id, client_id, service_id, start_time, end_time]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('CREATE APPOINTMENT ERROR:', err);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error constraint:', err.constraint);

    // Проверяем constraint нарушение (время пересекается)
    if (err.constraint === 'appointments_no_overlap') {
      return res.status(409).json({ message: 'Appointment overlaps existing booking' });
    }

    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// =======================
// PUT update appointment
// =======================
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { master_id, client_id, service_id, start_time, status } = req.body;
  const schema = tenantSchema(req.user.tenantId);
  const userId = req.user.id;
  const role = req.user.role;

  if (!master_id || !client_id || !service_id || !start_time) {
    return res.status(400).json({
      message: 'master_id, client_id, service_id, start_time required',
    });
  }

  try {
    // Проверяем существует ли запись
    const checkAppointment = await db.query(
      `SELECT master_id FROM ${schema}.appointments WHERE id = $1`,
      [id]
    );

    if (checkAppointment.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Если мастер - проверяем что это его запись
    if (role === 'master') {
      const masterResult = await db.query(
        `SELECT id FROM ${schema}.masters WHERE user_id = $1`,
        [userId]
      );

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: 'Master profile not found' });
      }

      if (checkAppointment.rows[0].master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: 'Can only edit your own appointments' });
      }
    }

    // Получаем продолжительность услуги
    const serviceResult = await db.query(
      `SELECT duration FROM ${schema}.services WHERE id = $1`,
      [service_id]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Service not found' });
    }

    const duration = serviceResult.rows[0].duration;

    // Рассчитываем end_time
    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const end_time = endDate.toISOString();

    const { rows } = await db.query(
      `
      UPDATE ${schema}.appointments
      SET master_id = $1, client_id = $2, service_id = $3, start_time = $4, end_time = $5, status = $6
      WHERE id = $7
      RETURNING 
        id,
        master_id,
        client_id,
        service_id,
        start_time,
        end_time,
        status,
        created_at
      `,
      [master_id, client_id, service_id, start_time, end_time, status || 'planned', id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('UPDATE APPOINTMENT ERROR:', err);

    if (err.constraint === 'appointments_no_overlap') {
      return res.status(409).json({ message: 'Appointment overlaps existing booking' });
    }

    res.status(500).json({ message: 'Server error' });
  }
});

// =======================
// DELETE appointment
// =======================
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const schema = tenantSchema(req.user.tenantId);
  const userId = req.user.id;
  const role = req.user.role;

  try {
    // Проверяем существует ли запись
    const checkAppointment = await db.query(
      `SELECT master_id FROM ${schema}.appointments WHERE id = $1`,
      [id]
    );

    if (checkAppointment.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Если мастер - проверяем что это его запись
    if (role === 'master') {
      const masterResult = await db.query(
        `SELECT id FROM ${schema}.masters WHERE user_id = $1`,
        [userId]
      );

      if (masterResult.rows.length === 0) {
        return res.status(403).json({ message: 'Master profile not found' });
      }

      if (checkAppointment.rows[0].master_id !== masterResult.rows[0].id) {
        return res.status(403).json({ message: 'Can only delete your own appointments' });
      }
    }

    // Удаляем запись
    await db.query(
      `DELETE FROM ${schema}.appointments WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Appointment deleted successfully' });
  } catch (err) {
    console.error('DELETE APPOINTMENT ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;