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
        AVG(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60)::INTEGER as avgDurationMin,
        EXTRACT(DOW FROM a.start_time) as dayOfWeek,
        EXTRACT(DOW FROM a.start_time)::TEXT as dayName
      FROM ${schema}.masters m
      LEFT JOIN ${schema}.appointments a ON m.id = a.master_id 
        AND a.start_time >= $1::timestamp
        AND a.start_time < $2::timestamp
      GROUP BY m.id, m.name
      ORDER BY m.name
    `;

    const result = await db.query(query, [from, to]);
    
    // Группируем по мастерам и дням недели
    const masterAnalysis = {};
    result.rows.forEach(row => {
      if (!masterAnalysis[row.id]) {
        masterAnalysis[row.id] = {
          id: row.id,
          masterName: row.masterName,
          totalAppointments: 0,
          cancelledCount: 0,
          avgDurationMin: 0,
          byDay: {},
          allRecords: []
        };
      }

      masterAnalysis[row.id].totalAppointments += row.totalAppointments;
      masterAnalysis[row.id].cancelledCount += row.cancelledCount;
      masterAnalysis[row.id].allRecords.push(row);

      if (row.dayOfWeek !== null) {
        const dayName = getDayName(row.dayOfWeek);
        masterAnalysis[row.id].byDay[dayName] = {
          appointments: row.totalAppointments,
          completed: row.completedAppointments,
          cancelled: row.cancelledCount,
          avgDuration: row.avgDurationMin
        };
      }
    });

    // Получаем услуги и их длительность
    const servicesQuery = `
      SELECT 
        s.id,
        s.name,
        s.duration_min as duration,
        COUNT(a.id) as usageCount
      FROM ${schema}.services s
      LEFT JOIN ${schema}.appointments a ON s.id = a.service_id
        AND a.start_time >= $1::timestamp
        AND a.start_time < $2::timestamp
      GROUP BY s.id, s.name, s.duration_min
      ORDER BY usageCount DESC
    `;

    const servicesResult = await db.query(servicesQuery, [from, to]);

    return {
      masterAnalysis,
      services: servicesResult.rows,
      period: { from, to }
    };
  } catch (error) {
    console.error("Schedule analysis error:", error);
    throw error;
  }
}

function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

module.exports = {
  getScheduleAnalysis,
};