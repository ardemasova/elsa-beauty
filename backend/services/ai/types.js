/**
 * @typedef {Object} ReportSummaryInput
 * @property {Object} revenue - Revenue data
 * @property {number} revenue.total - Total revenue
 * @property {number} revenue.completedAppointments - Completed appointments count
 * @property {Array} revenueByMaster - Revenue breakdown by master
 * @property {Object} cancelled - Cancelled appointments data
 * @property {number} cancelled.count - Number of cancelled appointments
 * @property {number} cancelled.lostRevenue - Lost revenue from cancellations
 * @property {Object} averages - Average metrics
 * @property {number} averages.avgCheck - Average check amount
 * @property {number} averages.paymentCount - Total payments
 * @property {Object} period - Report period
 * @property {string} period.from - Start date (YYYY-MM-DD)
 * @property {string} period.to - End date (YYYY-MM-DD)
 */

/**
 * @typedef {Object} ReportSummaryOutput
 * @property {string} headline - Brief headline
 * @property {Array<string>} key_insights - Key findings
 * @property {Array<string>} warnings - Concerning metrics
 * @property {Array<string>} recommendations - Actionable recommendations
 */

module.exports = {};