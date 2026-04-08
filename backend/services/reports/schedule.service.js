const db = require("../../db");

/**
 * Analyze schedule and master availability
 */
async function getScheduleAnalysis(schema, from, to) {
  try {
    console.log("Getting schedule analysis...");

    // Получаем данные о мастерах и их записях
    const query = `
      SELECT 
        m.id,
        m.name as masterName,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completedAppointments,
        COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelledCount,
        COUNT(*) as totalAppointments,
        AVG(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60)::INTEGER as avgDurationMin
      FROM ${schema}.masters m
      LEFT JOIN ${schema}.appointments a ON m.id = a.master_id 
        AND a.start_time >= $1::timestamp
        AND a.start_time < $2::timestamp
      GROUP BY m.id, m.name
      ORDER BY m.name
    `;

    const result = await db.query(query, [from, to]);
    
    // Формируем masterInsights напрямую
    const masterInsights = result.rows.map(row => ({
   id: row.id,
  masterName: row.mastername,
  totalAppointments: parseInt(row.totalappointments, 10) || 0,
  cancelledCount: parseInt(row.cancelledcount, 10) || 0,
  avgDurationMin: parseInt(row.avgdurationmin, 10) || 0,
  availabilityPercent: 100 - Math.min(100, (parseInt(row.totalappointments, 10) / 20) * 100),
  recommendations: "Good availability balance. Focus on filling flexible slots."
}));


    // Получаем услуги и их длительность
    const servicesQuery = `
      SELECT 
        s.id,
        s.name,
        s.duration as duration,
        COUNT(a.id) as usageCount
      FROM ${schema}.services s
      LEFT JOIN ${schema}.appointments a ON s.id = a.service_id
        AND a.start_time >= $1::timestamp
        AND a.start_time < $2::timestamp
      GROUP BY s.id, s.name, s.duration
      ORDER BY usageCount DESC
    `;

    const servicesResult = await db.query(servicesQuery, [from, to]);
 console.log('SCHEDULE RESPONSE:', masterInsights);
    return {
      masterAnalysis: masterInsights,
  services: servicesResult.rows,
  period: { from, to }
};
  } catch (error) {
    console.error("Schedule analysis error:", error);
    throw error;
  }
}
module.exports = {
  getScheduleAnalysis,
};