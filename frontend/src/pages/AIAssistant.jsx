import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReportAnalysis from "../components/ai/ReportAnalysis";
import AdminAssistant from "../components/ai/AdminAssistant";
import ScheduleInsights from "../components/ai/ScheduleInsights";
import aiIcon from "../assets/icons/AIicon.png";
import "./AIAssistant.css";

export default function AIAssistant() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [activeTab, setActiveTab] = useState("report-analysis");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  return (
    <div className="ai-assistant-container">
      {/* Header with background image like other pages */}
      <div className="ai-header">
        <div className="ai-header-left">
          <img className="ai-icon-img" src={aiIcon} alt="AI" />
          <div className="ai-title-section">
            <h1>AI Assistant</h1>
            <p className="ai-subtitle">Get intelligent insights about your business using AI analysis</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ai-tabs">
        <button
          className={`tab ${activeTab === "report-analysis" ? "active" : ""}`}
          onClick={() => setActiveTab("report-analysis")}
          type="button"
        >
          📊 <span className="tab-label">Report Analysis</span>
        </button>

        <button
          className={`tab ${activeTab === "admin-assistant" ? "active" : ""}`}
          onClick={() => setActiveTab("admin-assistant")}
          type="button"
        >
          💬 <span className="tab-label">Admin Assistant</span>
        </button>

        <button
          className={`tab ${activeTab === "schedule-insights" ? "active" : ""}`}
          onClick={() => setActiveTab("schedule-insights")}
          type="button"
        >
          📅 <span className="tab-label">Schedule Insights</span>
        </button>
      </div>

      <div className="ai-content">
        {activeTab === "report-analysis" && <ReportAnalysis token={token} />}
        {activeTab === "admin-assistant" && <AdminAssistant token={token} />}
        {activeTab === "schedule-insights" && <ScheduleInsights token={token} />}
      </div>
    </div>
  );
}