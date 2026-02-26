import { useState } from "react";
import { getScheduleInsights } from "../../api/reportsApi";
import "./ScheduleInsights.css";

export default function ScheduleInsights({ token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState(null);
  const [dateRange, setDateRange] = useState({
    from: getDefaultFromDate(),
    to: getDefaultToDate(),
  });

  function getDefaultFromDate() {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split("T")[0];
  }

  function getDefaultToDate() {
    const date = new Date();
    return date.toISOString().split("T")[0];
  }

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setInsights(null);

    try {
      const data = await getScheduleInsights(token, dateRange.from, dateRange.to);
      setInsights(data);
    } catch (err) {
      console.error("Failed to generate insights:", err);
      setError(err.message || "Failed to generate schedule insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="schedule-insights">
      {/* Control Panel */}
      <div className="control-panel">
        <h2>📅 Schedule Insights</h2>
        <p className="control-subtitle">
          AI analysis of master availability and service recommendations
        </p>
        <div className="control-form">
          <div className="date-group">
            <div className="date-field">
              <label>From Date</label>
              <input
                type="date"
                name="from"
                value={dateRange.from}
                onChange={handleDateChange}
                className="date-input"
              />
            </div>
            <div className="date-separator">→</div>
            <div className="date-field">
              <label>To Date</label>
              <input
                type="date"
                name="to"
                value={dateRange.to}
                onChange={handleDateChange}
                className="date-input"
              />
            </div>
          </div>

          <button
            className="btn-generate"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner">⏳</span>
                Analyzing...
              </>
            ) : (
              <>
                <span className="rocket">🚀</span>
                Generate Insights
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <div>
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Insights Result */}
      {insights && (
        <div className="insights-result">
          {/* Master Insights */}
          {insights.masterInsights && insights.masterInsights.length > 0 && (
            <div className="insights-section">
              <h3>
                <span className="section-icon">👥</span>
                Master Availability
              </h3>
              <div className="masters-grid">
                {insights.masterInsights.map((master, idx) => (
                  <div key={idx} className="master-card">
                    <div className="master-header">
                      <h4>{master.masterName}</h4>
                      <div className="availability-badge">
                        {master.availabilityPercent}% Free
                      </div>
                    </div>

                    <div className="master-stats">
                      <div className="stat">
                        <span className="stat-label">Appointments</span>
                        <span className="stat-value">{master.totalAppointments}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Cancellations</span>
                        <span className="stat-value error">{master.cancelledCount}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Avg Duration</span>
                        <span className="stat-value">{master.avgDurationMin}m</span>
                      </div>
                    </div>

                    {/* Best Days */}
                    {master.bestDays && master.bestDays.length > 0 && (
                      <div className="best-days">
                        <p className="days-label">💪 Best Days:</p>
                        <div className="days-list">
                          {master.bestDays.map((day, i) => (
                            <span key={i} className="day-badge">{day}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Slow Days */}
                    {master.slowDays && master.slowDays.length > 0 && (
                      <div className="slow-days">
                        <p className="days-label">📉 Slow Days:</p>
                        <div className="days-list">
                          {master.slowDays.map((day, i) => (
                            <span key={i} className="day-badge slow">{day}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {master.recommendations && (
                      <div className="recommendations">
                        <p className="rec-label">💡 Recommendation:</p>
                        <p className="rec-text">{master.recommendations}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Service Duration Insights */}
          {insights.serviceDurationInsights && (
            <div className="insights-section">
              <h3>
                <span className="section-icon">⏱️</span>
                Service Duration Analysis
              </h3>
              <div className="duration-insights">
                <div className="duration-card">
                  <h4>Most Popular Duration</h4>
                  <div className="duration-stat">
                    <span className="duration-value">
                      {insights.serviceDurationInsights.mostPopularDuration}
                    </span>
                    <span className="duration-label">minutes</span>
                  </div>
                  <p className="insight-text">
                    {insights.serviceDurationInsights.popularityReason}
                  </p>
                </div>

                <div className="duration-card">
                  <h4>Recommended Services</h4>
                  <div className="service-list">
                    {insights.serviceDurationInsights.recommendedServices?.map(
                      (service, idx) => (
                        <div key={idx} className="service-item">
                          <span className="service-name">{service.name}</span>
                          <span className="service-duration">{service.duration}m</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Optimization Tips */}
          {insights.optimizationTips && insights.optimizationTips.length > 0 && (
            <div className="insights-section">
              <h3>
                <span className="section-icon">🎯</span>
                Optimization Tips
              </h3>
              <div className="tips-list">
                {insights.optimizationTips.map((tip, idx) => (
                  <div key={idx} className="tip-item">
                    <div className="tip-number">{idx + 1}</div>
                    <div className="tip-content">
                      <p>{tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period Info */}
          <div className="period-info">
            <p>
              Analysis for period: <strong>{dateRange.from}</strong> to{" "}
              <strong>{dateRange.to}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !insights && !error && (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <p>Select a date range and click "Generate Insights"</p>
          <p className="empty-subtitle">
            AI will analyze your schedule and provide recommendations for optimizing
            master availability
          </p>
        </div>
      )}
    </div>
  );
}