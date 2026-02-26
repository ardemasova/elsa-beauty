import { useState } from "react";
import { getAISummary } from "../../api/reportsApi";
import "./ReportAnalysis.css";

export default function ReportAnalysis({ token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
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
    setSummary(null);

    try {
      const data = await getAISummary(token, dateRange.from, dateRange.to);
      setSummary(data);
    } catch (err) {
      console.error("Failed to generate summary:", err);
      setError(err.message || "Failed to generate AI summary");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="report-analysis">
      {/* Control Panel */}
      <div className="control-panel">
        <h2>Generate Report Analysis</h2>
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
                Generating...
              </>
            ) : (
              <>
                <span className="rocket">🚀</span>
                Generate AI Analysis
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

      {/* AI Summary Result */}
      {summary && (
        <div className="ai-result">
          {/* Headline */}
          <div className="headline-section">
            <h2 className="headline">
              <span className="highlight-icon">✨</span>
              {summary.headline}
            </h2>
          </div>

          {/* Key Insights */}
          {summary.key_insights && summary.key_insights.length > 0 && (
            <div className="insights-section">
              <h3>
                <span className="section-icon">💡</span>
                Key Insights
              </h3>
              <div className="insights-list">
                {summary.key_insights.map((insight, idx) => (
                  <div key={idx} className="insight-item">
                    <div className="insight-number">{idx + 1}</div>
                    <p>{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {summary.warnings && summary.warnings.length > 0 && (
            <div className="warnings-section">
              <h3>
                <span className="section-icon">⚠️</span>
                Warnings & Concerns
              </h3>
              <div className="warnings-list">
                {summary.warnings.map((warning, idx) => (
                  <div key={idx} className="warning-item">
                    <span className="warning-dot">●</span>
                    <p>{warning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {summary.recommendations && summary.recommendations.length > 0 && (
            <div className="recommendations-section">
              <h3>
                <span className="section-icon">🎯</span>
                Recommendations
              </h3>
              <div className="recommendations-list">
                {summary.recommendations.map((rec, idx) => (
                  <div key={idx} className="recommendation-item">
                    <div className="rec-number">{idx + 1}</div>
                    <p>{rec}</p>
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
      {!loading && !summary && !error && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>Select a date range and click "Generate AI Analysis"</p>
          <p className="empty-subtitle">
            AI will analyze your business metrics and provide insights
          </p>
        </div>
      )}
    </div>
  );
}