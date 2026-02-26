const db = require('../../db');

class ReportsRepository {
  // Получить общий доход и количество завершённых записей
  async getTotalRevenue(schema, fromDate, toDate) {
    const query = `
      SELECT
        COALESCE(SUM(p.amount), 0) AS total_revenue,
        COUNT(a.id) AS completed_appointments
      FROM ${schema}.appointments a
      LEFT JOIN ${schema}.payments p ON p.appointment_id = a.id
      WHERE a.status = 'completed'
        AND a.start_time::date BETWEEN $1 AND $2
    `;

    const { rows } = await db.query(query, [fromDate, toDate]);
    return rows[0] || { total_revenue: 0, completed_appointments: 0 };
  }

  // Получить доход по мастерам
  async getRevenueByMaster(schema, fromDate, toDate) {
    const query = `
      SELECT
        m.id AS master_id,
        m.name AS master_name,
        COUNT(a.id) AS appointments,
        COALESCE(SUM(p.amount), 0) AS revenue
      FROM ${schema}.appointments a
      LEFT JOIN ${schema}.payments p ON p.appointment_id = a.id
      JOIN ${schema}.masters m ON m.id = a.master_id
      WHERE a.status = 'completed'
        AND a.start_time::date BETWEEN $1 AND $2
      GROUP BY m.id, m.name
      ORDER BY revenue DESC
    `;

    const { rows } = await db.query(query, [fromDate, toDate]);
    return rows;
  }

  // Получить статистику по отмененным записям
  async getCancelledStats(schema, fromDate, toDate) {
    const query = `
      SELECT
        COUNT(a.id) AS cancelled_count,
        COALESCE(SUM(s.price), 0) AS lost_revenue
      FROM ${schema}.appointments a
      JOIN ${schema}.services s ON s.id = a.service_id
      WHERE a.status = 'cancelled'
        AND a.start_time::date BETWEEN $1 AND $2
    `;

    const { rows } = await db.query(query, [fromDate, toDate]);
    return rows[0] || { cancelled_count: 0, lost_revenue: 0 };
  }

  // Получить средний чек
  async getAverageCheck(schema, fromDate, toDate) {
    const query = `
      SELECT
        ROUND(COALESCE(AVG(p.amount), 0), 2) AS avg_check,
        COUNT(a.id) AS payment_count
      FROM ${schema}.appointments a
      LEFT JOIN ${schema}.payments p ON p.appointment_id = a.id
      WHERE a.status = 'completed'
        AND a.start_time::date BETWEEN $1 AND $2
    `;

    const { rows } = await db.query(query, [fromDate, toDate]);
    return rows[0] || { avg_check: 0, payment_count: 0 };
  }

  // Получить статистику по услугам
  async getRevenueByService(schema, fromDate, toDate) {
    const query = `
      SELECT
        s.id AS service_id,
        s.name AS service_name,
        COUNT(a.id) AS appointments,
        COALESCE(SUM(p.amount), 0) AS revenue
      FROM ${schema}.appointments a
      LEFT JOIN ${schema}.payments p ON p.appointment_id = a.id
      JOIN ${schema}.services s ON s.id = a.service_id
      WHERE a.status = 'completed'
        AND a.start_time::date BETWEEN $1 AND $2
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    `;

    const { rows } = await db.query(query, [fromDate, toDate]);
    return rows;
  }

  // Получить статистик�� по клиентам
  async getRevenueByClient(schema, fromDate, toDate) {
    const query = `
      SELECT
        c.id AS client_id,
        c.name AS client_name,
        COUNT(a.id) AS appointments,
        COALESCE(SUM(p.amount), 0) AS revenue
      FROM ${schema}.appointments a
      LEFT JOIN ${schema}.payments p ON p.appointment_id = a.id
      JOIN ${schema}.clients c ON c.id = a.client_id
      WHERE a.status = 'completed'
        AND a.start_time::date BETWEEN $1 AND $2
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;

    const { rows } = await db.query(query, [fromDate, toDate]);
    return rows;
  }
}

module.exports = new ReportsRepository();