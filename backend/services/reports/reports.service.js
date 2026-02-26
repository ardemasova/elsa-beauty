const reportsRepository = require('./reports.repository');

class ReportsService {
  // ===== КЛЮЧЕВАЯ ФУНКЦИЯ =====
  async getReportSummaryStats(schema, fromDate, toDate) {
    try {
      const [
        revenue,
        revenueByMaster,
        cancelled,
        averageCheck,
      ] = await Promise.all([
        this._getRevenue(schema, fromDate, toDate),
        this._getRevenueByMaster(schema, fromDate, toDate),
        this._getCancelled(schema, fromDate, toDate),
        this._getAverages(schema, fromDate, toDate),
      ]);

      return {
        revenue,
        revenueByMaster,
        cancelled,
        averages: averageCheck,
        period: {
          from: fromDate,
          to: toDate,
        },
      };
    } catch (err) {
      console.error('GET REPORT SUMMARY STATS ERROR:', err);
      throw err;
    }
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ (вспомогательные) =====

  // Получить доход
  async _getRevenue(schema, fromDate, toDate) {
    try {
      const data = await reportsRepository.getTotalRevenue(schema, fromDate, toDate);
      return {
        total: parseFloat(data.total_revenue),
        completedAppointments: parseInt(data.completed_appointments),
      };
    } catch (err) {
      console.error('GET REVENUE ERROR:', err);
      throw err;
    }
  }

  // Получить доход по мастерам
  async _getRevenueByMaster(schema, fromDate, toDate) {
    try {
      const data = await reportsRepository.getRevenueByMaster(schema, fromDate, toDate);
      return data.map(row => ({
        masterId: row.master_id,
        masterName: row.master_name,
        appointments: parseInt(row.appointments),
        revenue: parseFloat(row.revenue),
      }));
    } catch (err) {
      console.error('GET REVENUE BY MASTER ERROR:', err);
      throw err;
    }
  }

  // Получить статистику по отмененным записям
  async _getCancelled(schema, fromDate, toDate) {
    try {
      const data = await reportsRepository.getCancelledStats(schema, fromDate, toDate);
      return {
        count: parseInt(data.cancelled_count),
        lostRevenue: parseFloat(data.lost_revenue),
      };
    } catch (err) {
      console.error('GET CANCELLED ERROR:', err);
      throw err;
    }
  }

  // Получить средние значения
  async _getAverages(schema, fromDate, toDate) {
    try {
      const data = await reportsRepository.getAverageCheck(schema, fromDate, toDate);
      return {
        avgCheck: parseFloat(data.avg_check),
        paymentCount: parseInt(data.payment_count),
      };
    } catch (err) {
      console.error('GET AVERAGES ERROR:', err);
      throw err;
    }
  }

  // ===== ПУБЛИЧНЫЕ МЕТОДЫ (для отдельных запросов) =====

  // Получить все сводные статистики за период
  async getSummaryStats(schema, fromDate, toDate) {
    return this.getReportSummaryStats(schema, fromDate, toDate);
  }

  // Получить доход по мастерам
  async getRevenueByMaster(schema, fromDate, toDate) {
    return this._getRevenueByMaster(schema, fromDate, toDate);
  }

  // Получить статистику по отмененным записям
  async getCancelledStats(schema, fromDate, toDate) {
    return this._getCancelled(schema, fromDate, toDate);
  }

  // Получить средний чек
  async getAverageCheck(schema, fromDate, toDate) {
    return this._getAverages(schema, fromDate, toDate);
  }

  // Получить доход по услугам
  async getRevenueByService(schema, fromDate, toDate) {
    try {
      const data = await reportsRepository.getRevenueByService(schema, fromDate, toDate);
      return data.map(row => ({
        serviceId: row.service_id,
        serviceName: row.service_name,
        appointments: parseInt(row.appointments),
        revenue: parseFloat(row.revenue),
      }));
    } catch (err) {
      console.error('GET REVENUE BY SERVICE ERROR:', err);
      throw err;
    }
  }

  // Получить доход по клиентам
  async getRevenueByClient(schema, fromDate, toDate) {
    try {
      const data = await reportsRepository.getRevenueByClient(schema, fromDate, toDate);
      return data.map(row => ({
        clientId: row.client_id,
        clientName: row.client_name,
        appointments: parseInt(row.appointments),
        revenue: parseFloat(row.revenue),
      }));
    } catch (err) {
      console.error('GET REVENUE BY CLIENT ERROR:', err);
      throw err;
    }
  }
}

module.exports = new ReportsService();