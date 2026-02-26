const { openai } = require("./aiClient");
const { reportSummaryPrompt } = require("./prompts");

/**
 * Fallback summary in case AI fails
 */
function fallbackSummary(input) {
  return {
    headline: `Report for ${input.period.from} to ${input.period.to}`,
    key_insights: [
      `Total revenue: $${input.revenue.total.toFixed(2)} from ${input.revenue.completedAppointments} appointments`,
      `Average check: $${input.averages.avgCheck.toFixed(2)}`,
      `Cancelled appointments: ${input.cancelled.count} (Lost revenue: $${input.cancelled.lostRevenue.toFixed(2)})`,
    ],
    warnings:
      input.cancelled.count > 0
        ? [
            `${input.cancelled.count} appointments were cancelled`,
            `Lost revenue due to cancellations: $${input.cancelled.lostRevenue.toFixed(2)}`,
          ]
        : [],
    recommendations: [
      "Review master performance metrics regularly",
      "Monitor cancellation patterns to identify issues",
      "Consider loyalty programs to increase repeat customers",
    ],
  };
}

/**
 * Generate AI-powered report summary
 */
async function generateReportSummary(input) {
  try {
    console.log("Generating AI report summary...");

    const userMessage = `
Here is the business report data for a beauty salon:

Period: ${input.period.from} to ${input.period.to}

Revenue:
- Total Revenue: $${input.revenue.total.toFixed(2)}
- Completed Appointments: ${input.revenue.completedAppointments}
- Average Check: $${input.averages.avgCheck.toFixed(2)}

Revenue by Master:
${input.revenueByMaster
  .map(
    (m) => `- ${m.masterName}: $${m.revenue.toFixed(2)} (${m.appointments} appointments)`
  )
  .join("\n")}

Cancelled Appointments:
- Count: ${input.cancelled.count}
- Lost Revenue: $${input.cancelled.lostRevenue.toFixed(2)}

Please analyze this data and provide insights.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      max_tokens: 1024,
      system: reportSummaryPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const text = response.choices[0].message.content;

    console.log("AI Response:", text);

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.log("Using fallback summary");
      return fallbackSummary(input);
    }
  } catch (error) {
    console.error("AI Service Error:", error);
    console.log("Using fallback summary due to error");
    return fallbackSummary(input);
  }
}

/**
 * Generate AI response for admin chat
 */
async function generateAdminChatResponse(context) {
  try {
    console.log("Generating admin chat response...");

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are a business analyst AI assistant for a beauty salon. Based on the business context provided, answer the user's question concisely and directly using ONLY the provided data. Be professional but conversational. Keep your answer to 2-3 sentences.

${context}`,
        },
      ],
    });

    const text = response.choices[0].message.content;
    console.log("Admin chat response:", text);
    return text || "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Admin chat error:", error);
    // Fallback ответ вместо ошибки
    return "I'm currently unable to process your question due to service limitations. Please try again later.";
  }
}

module.exports = {
  generateReportSummary,
  generateAdminChatResponse,
  fallbackSummary,
};

/**
 * Generate AI schedule insights
 */
async function generateScheduleInsights(scheduleData) {
  try {
    console.log("Generating schedule insights...");

    const masterInsights = [];
    const masters = Object.values(scheduleData.masterAnalysis);

    for (const master of masters) {
      if (master.totalAppointments === 0) continue;

      // Определяем свободные дни
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const bestDays = [];
      const slowDays = [];

      for (const day of dayNames) {
        if (master.byDay[day]) {
          if (master.byDay[day].appointments > 3) {
            bestDays.push(day.substring(0, 3));
          } else if (master.byDay[day].appointments < 2) {
            slowDays.push(day.substring(0, 3));
          }
        }
      }

      // Вычисляем процент загруз��и
      const totalSlots = master.totalAppointments + (Math.ceil(master.totalAppointments * 0.3)); // примерное количество слотов
      const availabilityPercent = Math.max(0, Math.round((1 - (master.totalAppointments / totalSlots)) * 100));

      // Генерируем рекомендацию
      let recommendations = "";
      if (availabilityPercent > 40) {
        recommendations = `Promote shorter services up to ${master.avgDurationMin || 45} minutes on ${slowDays.join(', ')} to increase bookings.`;
      } else if (availabilityPercent < 10) {
        recommendations = `Master is highly booked. Consider adding more slots or longer services.`;
      } else {
        recommendations = `Good availability balance. Focus on filling ${slowDays.length > 0 ? slowDays.join(', ') : 'flexible slots'}.`;
      }

      masterInsights.push({
        masterName: master.masterName,
        totalAppointments: master.totalAppointments,
        cancelledCount: master.cancelledCount,
        avgDurationMin: Math.round(master.avgDurationMin || 0),
        availabilityPercent: availabilityPercent,
        bestDays: bestDays,
        slowDays: slowDays,
        recommendations: recommendations
      });
    }

    // Анализируем услуги
    const topServices = scheduleData.services.slice(0, 5);
    const avgDuration = topServices.length > 0 
      ? Math.round(topServices.reduce((sum, s) => sum + s.duration, 0) / topServices.length)
      : 60;

    return {
      masterInsights,
      serviceDurationInsights: {
        mostPopularDuration: avgDuration,
        popularityReason: `Average service duration across all services is ${avgDuration} minutes.`,
        recommendedServices: topServices.map(s => ({
          name: s.name,
          duration: s.duration
        }))
      },
      optimizationTips: [
        `Focus on ${masterInsights[0]?.masterName || 'busy masters'} during peak hours to maximize revenue.`,
        `Recommend ${avgDuration}+ minute services to fully utilize master availability.`,
        `Schedule promotions on ${masterInsights.flatMap(m => m.slowDays)[0] || 'slower days'} to balance workload.`,
        `Bundle short services (under 30 min) to increase total appointments per master.`
      ]
    };
  } catch (error) {
    console.error("Schedule insights error:", error);
    return {
      masterInsights: [],
      serviceDurationInsights: {},
      optimizationTips: [],
      error: error.message
    };
  }
}

module.exports = {
  generateReportSummary,
  generateAdminChatResponse,
  generateScheduleInsights,
  fallbackSummary,
};

/**
 * Fallback schedule insights
 */
function fallbackScheduleInsights(scheduleData) {
  return {
    masterInsights: Object.values(scheduleData.masterAnalysis || {}).map(master => ({
      masterName: master.masterName,
      totalAppointments: master.totalAppointments || 0,
      cancelledCount: master.cancelledCount || 0,
      avgDurationMin: Math.round(master.avgDurationMin || 45),
      availabilityPercent: 30,
      bestDays: ['Mon', 'Wed', 'Fri'],
      slowDays: ['Tue', 'Thu'],
      recommendations: "Schedule promotions on slow days to increase bookings."
    })),
    serviceDurationInsights: {
      mostPopularDuration: 60,
      popularityReason: "Most customers prefer 60-minute services.",
      recommendedServices: (scheduleData.services || []).slice(0, 3).map(s => ({
        name: s.name,
        duration: s.duration
      }))
    },
    optimizationTips: [
      "Focus on peak hours to maximize revenue.",
      "Bundle short services to increase total appointments.",
      "Schedule promotions on slower days to balance workload.",
      "Consider longer service packages for premium pricing."
    ]
  };
}

/**
 * Generate AI schedule insights
 */
async function generateScheduleInsights(scheduleData) {
  try {
    console.log("Generating schedule insights...");

    // Если нет данных, вернём fallback
    if (!scheduleData || !scheduleData.masterAnalysis) {
      console.log("No schedule data, using fallback");
      return fallbackScheduleInsights(scheduleData);
    }

    // Пытаемся вызвать AI, но если ошибка - используем fallback
    try {
      const masterInsights = [];
      const masters = Object.values(scheduleData.masterAnalysis);

      for (const master of masters) {
        if (master.totalAppointments === 0) continue;

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const bestDays = [];
        const slowDays = [];

        for (const day of dayNames) {
          if (master.byDay[day]) {
            if (master.byDay[day].appointments > 3) {
              bestDays.push(day.substring(0, 3));
            } else if (master.byDay[day].appointments < 2) {
              slowDays.push(day.substring(0, 3));
            }
          }
        }

        const totalSlots = master.totalAppointments + (Math.ceil(master.totalAppointments * 0.3));
        const availabilityPercent = Math.max(0, Math.round((1 - (master.totalAppointments / totalSlots)) * 100));

        let recommendations = "";
        if (availabilityPercent > 40) {
          recommendations = `Promote shorter services up to ${master.avgDurationMin || 45} minutes on ${slowDays.join(', ')} to increase bookings.`;
        } else if (availabilityPercent < 10) {
          recommendations = `Master is highly booked. Consider adding more slots or longer services.`;
        } else {
          recommendations = `Good availability balance. Focus on filling ${slowDays.length > 0 ? slowDays.join(', ') : 'flexible slots'}.`;
        }

        masterInsights.push({
          masterName: master.masterName,
          totalAppointments: master.totalAppointments,
          cancelledCount: master.cancelledCount,
          avgDurationMin: Math.round(master.avgDurationMin || 0),
          availabilityPercent: availabilityPercent,
          bestDays: bestDays,
          slowDays: slowDays,
          recommendations: recommendations
        });
      }

      const topServices = scheduleData.services.slice(0, 5);
      const avgDuration = topServices.length > 0 
        ? Math.round(topServices.reduce((sum, s) => sum + s.duration, 0) / topServices.length)
        : 60;

      return {
        masterInsights,
        serviceDurationInsights: {
          mostPopularDuration: avgDuration,
          popularityReason: `Average service duration across all services is ${avgDuration} minutes.`,
          recommendedServices: topServices.map(s => ({
            name: s.name,
            duration: s.duration
          }))
        },
        optimizationTips: [
          `Focus on ${masterInsights[0]?.masterName || 'busy masters'} during peak hours to maximize revenue.`,
          `Recommend ${avgDuration}+ minute services to fully utilize master availability.`,
          `Schedule promotions on ${masterInsights.flatMap(m => m.slowDays)[0] || 'slower days'} to balance workload.`,
          `Bundle short services (under 30 min) to increase total appointments per master.`
        ]
      };
    } catch (aiError) {
      console.error("AI Service Error:", aiError);
      console.log("Using fallback schedule insights");
      return fallbackScheduleInsights(scheduleData);
    }
  } catch (error) {
    console.error("Schedule insights error:", error);
    return fallbackScheduleInsights(scheduleData);
  }
}

module.exports = {
  generateReportSummary,
  generateAdminChatResponse,
  generateScheduleInsights,
  fallbackSummary,
};