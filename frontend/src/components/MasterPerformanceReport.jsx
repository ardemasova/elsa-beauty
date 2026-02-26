import { useState, useEffect } from "react";
import { getMasterPerformance, getMasters, exportToExcel } from "../api/masterStatsApi";
import "./MasterPerformanceReport.css";

export default function MasterPerformanceReport() {
  const token = localStorage.getItem("token");
  
  const [data, setData] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Фильтры
  const [dateRange, setDateRange] = useState("month"); // day, week, month, custom
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedMaster, setSelectedMaster] = useState("");

  useEffect(() => {
    loadMasters();
    loadData();
  }, []);

  const loadMasters = async () => {
    try {
      const mastersData = await getMasters(token);
      setMasters(mastersData);
    } catch (err) {
      console.error("Failed to load masters:", err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const filters = {
        masterId: selectedMaster || undefined,
      };

      // Определяем даты в зависимости от выбранного периода
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);

      if (dateRange === "day") {
        filters.startDate = startOfDay.toISOString().split('T')[0];
        filters.endDate = today.toISOString().split('T')[0];
      } else if (dateRange === "week") {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        filters.startDate = startOfWeek.toISOString().split('T')[0];
        filters.endDate = today.toISOString().split('T')[0];
      } else if (dateRange === "month") {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        filters.startDate = startOfMonth.toISOString().split('T')[0];
        filters.endDate = today.toISOString().split('T')[0];
      } else if (dateRange === "custom") {
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;
      }

      const performanceData = await getMasterPerformance(token, filters);
      setData(performanceData);
      setError("");
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = () => {
    loadData();
  };

  const formatCurrency = (value) => {
    return `$${parseFloat(value || 0).toFixed(2)}`;
  };

  const formatPercent = (value) => {
    return `${parseFloat(value || 0).toFixed(1)}%`;
  };

  return (
    <div className="master-performance-container">
      <div className="report-header">
        <h1>📊 Master Performance Report</h1>
        <button 
          className="btn-export"
          onClick={() => exportToExcel(data, `master-performance-${new Date().toISOString().split('T')[0]}.csv`)}
          disabled={data.length === 0}
        >
          📥 Export to CSV
        </button>
      </div>

      {/* Фильтры */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Date Range</label>
          <select 
            value={dateRange} 
            onChange={(e) => {
              setDateRange(e.target.value);
              if (e.target.value !== "custom") {
                handleFilterChange();
              }
            }}
          >
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {dateRange === "custom" && (
          <>
            <div className="filter-group">
              <label>Start Date</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>End Date</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <button 
              className="btn-apply"
              onClick={handleFilterChange}
            >
              Apply
            </button>
          </>
        )}

        <div className="filter-group">
          <label>Master</label>
          <select 
            value={selectedMaster}
            onChange={(e) => {
              setSelectedMaster(e.target.value);
            }}
          >
            <option value="">All Masters</option>
            {masters.map(master => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </select>
          <button 
            className="btn-apply"
            onClick={handleFilterChange}
          >
            Filter
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading data...</div>
      ) : (
        <>
          {/* Карточки мастеров */}
          <div className="masters-cards-grid">
            {data.map(master => (
              <div key={master.master_id} className="master-card">
                <div className="master-card-header">
                  <h3>{master.master_name}</h3>
                </div>
                <div className="master-card-grid">
                  <div className="card-stat">
                    <span className="label">Revenue</span>
                    <span className="value">{formatCurrency(master.revenue_generated)}</span>
                  </div>
                  <div className="card-stat">
                    <span className="label">Commission</span>
                    <span className="value">{formatCurrency(master.commission)}</span>
                  </div>
                  <div className="card-stat">
                    <span className="label">Net Margin</span>
                    <span className="value">{formatCurrency(master.net_margin)}</span>
                  </div>
                  <div className="card-stat">
                    <span className="label">Margin %</span>
                    <span className="value">{formatPercent(master.margin_percent)}</span>
                  </div>
                  <div className="card-stat">
                    <span className="label">Appointments</span>
                    <span className="value">{master.appointments_completed}/{master.appointments_planned}</span>
                  </div>
                  <div className="card-stat">
                    <span className="label">Revenue/Hour</span>
                    <span className="value">{formatCurrency(master.revenue_per_hour)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.length === 0 && (
            <div className="empty-state">
              <p>No data available for selected filters</p>
            </div>
          )}

          {/* Таблица */}
          <div className="table-section">
            <h2>Detailed Performance</h2>
            <div className="table-wrapper">
              <table className="performance-table">
                <thead>
                  <tr>
                    <th>Master</th>
                    <th>Revenue</th>
                    <th>Commission</th>
                    <th>Gross Margin</th>
                    <th>Net Margin</th>
                    <th>Completed</th>
                    <th>Cancelled</th>
                    <th>Planned</th>
                    <th>Hours</th>
                    <th>Rev/Hour</th>
                    <th>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(master => (
                    <tr key={master.master_id}>
                      <td><strong>{master.master_name}</strong></td>
                      <td>{formatCurrency(master.revenue_generated)}</td>
                      <td>{formatCurrency(master.commission)}</td>
                      <td>{formatCurrency(master.gross_margin)}</td>
                      <td>{formatCurrency(master.net_margin)}</td>
                      <td className="text-center">{master.appointments_completed}</td>
                      <td className="text-center text-danger">{master.appointments_cancelled}</td>
                      <td className="text-center">{master.appointments_planned}</td>
                      <td>{parseFloat(master.hours_worked).toFixed(1)}</td>
                      <td>{formatCurrency(master.revenue_per_hour)}</td>
                      <td>{formatPercent(master.margin_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}