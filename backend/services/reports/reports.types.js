/**
 * @typedef {Object} SummaryStats
 * @property {Object} period - Период отчёта
 * @property {string} period.from - Дата начала (YYYY-MM-DD)
 * @property {string} period.to - Дата конца (YYYY-MM-DD)
 * @property {Object} revenue - Доход
 * @property {number} revenue.total - Общий доход
 * @property {number} revenue.completedAppointments - Завершённые записи
 * @property {Object} cancelled - Отмённые записи
 * @property {number} cancelled.count - Количество отмён
 * @property {number} cancelled.lostRevenue - Потерянный доход
 * @property {number} averageCheck - Средний чек
 * @property {number} paymentCount - Количество платежей
 */

/**
 * @typedef {Object} RevenueByMaster
 * @property {string} masterId - UUID мастера
 * @property {string} masterName - Имя мастера
 * @property {number} appointments - Количество записей
 * @property {number} revenue - Доход
 */

/**
 * @typedef {Object} CancelledStats
 * @property {number} count - Количество отмён
 * @property {number} lostRevenue - Потерянный доход
 */

module.exports = {};