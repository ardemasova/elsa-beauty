import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReportAnalysis from "../components/ai/ReportAnalysis";
import AdminAssistant from "../components/ai/AdminAssistant";
import ScheduleInsights from "../components/ai/ScheduleInsights";
import "./AIAssistant.css";

export default function AIAssistant() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [activeTab, setActiveTab] = useState("report-analysis");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [token]);

  return (
    <div className="ai-assistant-container">
      <div className="ai-header">
        <div className="ai-header-content">
          <div className="ai-icon">🤖</div>
          <div className="ai-title-section">
            <h1>AI Assistant</h1>
            <p className="ai-subtitle">
              Get intelligent insights about your business using AI analysis
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="ai-tabs">
        <button
          className={`ai-tab ${activeTab === "report-analysis" ? "active" : ""}`}
          onClick={() => setActiveTab("report-analysis")}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">Report Analysis</span>
        </button>
        <button
          className={`ai-tab ${activeTab === "admin-assistant" ? "active" : ""}`}
          onClick={() => setActiveTab("admin-assistant")}
        >
          <span className="tab-icon">💬</span>
          <span className="tab-label">Admin Assistant</span>
        </button>
        <button
          className={`ai-tab ${activeTab === "schedule-insights" ? "active" : ""}`}
          onClick={() => setActiveTab("schedule-insights")}
        >
          <span className="tab-icon">📅</span>
          <span className="tab-label">Schedule Insights</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="ai-content">
        {activeTab === "report-analysis" && <ReportAnalysis token={token} />}
        {activeTab === "admin-assistant" && <AdminAssistant token={token} />}
        {activeTab === "schedule-insights" && <ScheduleInsights token={token} />}
      </div>
    </div>
  );
}