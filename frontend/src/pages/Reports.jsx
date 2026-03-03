import { useState, useEffect, useMemo } from "react";
import { fetchMasters } from "../api/api";
import {
  getSummaryAll,
  getRevenueByMaster,
  getRevenueByService,
  getRevenueByDay,
  getCogsReport,
  getCogsSummary,
} from "../api/reportsApi";
import { getMasterPerformance } from "../api/masterStatsApi";
import * as XLSX from "xlsx";
import "./Reports.css";

export default function Reports() {
  const token = localStorage.getItem("token");

  const [masters, setMasters] = useState([]);
  const [report, setReport] = useState(null);

  const [masterPerformanceData, setMasterPerformanceData] = useState([]);
  const [revenueByMaster, setRevenueByMaster] = useState([]);
  const [revenueByService, setRevenueByService] = useState([]);
  const [revenueByDay, setRevenueByDay] = useState([]);

  const [cogsSummary, setCogsSummary] = useState(null);
  const [cogsReportData, setCogsReportData] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("master-performance"); // master-performance | revenue | cogs

  const [revenueTab, setRevenueTab] = useState("master"); // master | service | day
  const [cogsTab, setCogsTab] = useState("master"); // master | service | date

  function getDefaultFromDate() {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split("T")[0];
  }
  function getDefaultToDate() {
    const date = new Date();
    return date.toISOString().split("T")[0];
  }

  const [dateRange, setDateRange] = useState({
    from: getDefaultFromDate(),
    to: getDefaultToDate(),
  });

  const [performanceFilters, setPerformanceFilters] = useState({
    dateRange: "month",
    startDate: "",
    endDate: "",
    masterId: "",
  });

  useEffect(() => {
    loadMasters();
    loadReport();
    loadMasterPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMasters = async () => {
    try {
      const data = await fetchMasters(token);
      setMasters(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load masters:", err);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSummaryAll(token, dateRange.from, dateRange.to);
      setReport(data);

      const byMaster = await getRevenueByMaster(token, dateRange.from, dateRange.to);
      const byService = await getRevenueByService(token, dateRange.from, dateRange.to);
      const byDay = await getRevenueByDay(token, dateRange.from, dateRange.to);

      setRevenueByMaster(Array.isArray(byMaster) ? byMaster : []);
      setRevenueByService(Array.isArray(byService) ? byService : []);
      setRevenueByDay(Array.isArray(byDay) ? byDay : []);

      const cogsSummaryData = await getCogsSummary(token, dateRange.from, dateRange.to);
      setCogsSummary(cogsSummaryData);

      const cogsData = await getCogsReport(token, dateRange.from, dateRange.to, cogsTab);
      setCogsReportData(Array.isArray(cogsData) ? cogsData : []);
    } catch (err) {
      console.error("Failed to load report:", err);
      setError(err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const loadMasterPerformance = async () => {
    setLoading(true);
    setError("");
    try {
      const filters = {
        masterId: performanceFilters.masterId || undefined,
      };

      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);

      if (performanceFilters.dateRange === "day") {
        filters.startDate = startOfDay.toISOString().split("T")[0];
        filters.endDate = today.toISOString().split("T")[0];
      } else if (performanceFilters.dateRange === "week") {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        filters.startDate = startOfWeek.toISOString().split("T")[0];
        filters.endDate = today.toISOString().split("T")[0];
      } else if (performanceFilters.dateRange === "month") {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        filters.startDate = startOfMonth.toISOString().split("T")[0];
        filters.endDate = today.toISOString().split("T")[0];
      } else if (performanceFilters.dateRange === "custom") {
        if (performanceFilters.startDate) filters.startDate = performanceFilters.startDate;
        if (performanceFilters.endDate) filters.endDate = performanceFilters.endDate;
      }

      const data = await getMasterPerformance(token, filters);
      setMasterPerformanceData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load master performance:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange((prev) => ({ ...prev, [name]: value }));
  };

  const handlePerformanceFilterChange = (e) => {
    const { name, value } = e.target;
    setPerformanceFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleApply = async () => {
    await loadReport();
  };

  const handlePerformanceApply = async () => {
    await loadMasterPerformance();
  };

  const getRandomColor = (index) => {
    const colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
    return colors[index % colors.length];
  };

  const formatCurrency = (value) => `$${parseFloat(value || 0).toFixed(2)}`;
  const formatPercent = (value) => `${parseFloat(value || 0).toFixed(1)}%`;

  // ======= Excel export helpers =======
  const exportRowsToExcel = (rows, fileName, sheetName) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
  };

  const exportMasterPerformanceExcel = () => {
    const rows = masterPerformanceData.map((m) => ({
      "Master ID": m.master_id,
      Master: m.master_name,
      Revenue: Number(m.revenue_generated || 0),
      Commission: Number(m.commission || 0),
      "Gross Margin": Number(m.gross_margin || 0),
      "Net Margin": Number(m.net_margin || 0),
      Completed: m.appointments_completed,
      Cancelled: m.appointments_cancelled,
      Planned: m.appointments_planned,
      Hours: Number(m.hours_worked || 0),
      "Rev/Hour": Number(m.revenue_per_hour || 0),
      "Margin %": Number(m.margin_percent || 0),
    }));

    exportRowsToExcel(rows, `master-performance_${new Date().toISOString().slice(0, 10)}.xlsx`, "Master Performance");
  };

  const exportRevenueExcel = () => {
    let rows = [];
    let sheetName = "Revenue";

    if (revenueTab === "master") {
      sheetName = "Revenue by Master";
      rows = revenueByMaster.map((m) => ({
        "Master ID": m.master_id,
        Master: m.master_name,
        Revenue: Number(m.revenue || 0),
        Appointments: m.appointments_completed,
      }));
    } else if (revenueTab === "service") {
      sheetName = "Revenue by Service";
      rows = revenueByService.map((s) => ({
        "Service ID": s.service_id,
        Service: s.service_name,
        Revenue: Number(s.revenue || 0),
        "Times Sold": s.times_sold,
      }));
    } else {
      sheetName = "Revenue by Day";
      rows = revenueByDay.map((d) => ({
        Date: d.revenue_date,
        Revenue: Number(d.revenue || 0),
        Appointments: d.appointments_completed,
      }));
    }

    exportRowsToExcel(rows, `revenue_${revenueTab}_${dateRange.from}_${dateRange.to}.xlsx`, sheetName);
  };

  const exportCogsExcel = () => {
    const rows = cogsReportData.map((r) => ({
      Group: r.group_name,
      Transactions: r.transactions,
      Revenue: Number(r.revenue || 0),
      COGS: Number(r.cogs || 0),
      "Gross Margin": Number(r.gross_margin || 0),
      "Net Margin": Number(r.net_margin || 0),
      "Margin %": Number(r.avg_gross_margin_percent || 0),
    }));

    exportRowsToExcel(rows, `cogs_${cogsTab}_${dateRange.from}_${dateRange.to}.xlsx`, `COGS by ${cogsTab}`);
  };

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      try {
        const data = await getCogsReport(token, dateRange.from, dateRange.to, cogsTab);
        setCogsReportData(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cogsTab]);

  const showDateFilter = useMemo(() => activeTab !== "master-performance", [activeTab]);

  return (
    <div className="reports-container">
      <div className="reports-header-top">
        <h1>Reports</h1>
      </div>

      {/* Main tabs (like payments) */}
      <div className="reports-tabs">
        <button className={`tab ${activeTab === "master-performance" ? "active" : ""}`} onClick={() => setActiveTab("master-performance")}>
          📊 Master Performance
        </button>
        <button className={`tab ${activeTab === "revenue" ? "active" : ""}`} onClick={() => setActiveTab("revenue")}>
          💰 Revenue
        </button>
        <button className={`tab ${activeTab === "cogs" ? "active" : ""}`} onClick={() => setActiveTab("cogs")}>
          📋 COGS
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Master Performance */}
      {activeTab === "master-performance" && (
        <div className="report-section">
          <div className="report-header">
            <h2>Master Performance Report</h2>
            <button className="btn-secondary" onClick={exportMasterPerformanceExcel} disabled={!masterPerformanceData.length}>
              Export to Excel
            </button>
          </div>

          <div className="performance-filters">
            <div className="filters-row">
              <div className="filter-group">
                <label>Date Range</label>
                <select name="dateRange" value={performanceFilters.dateRange} onChange={handlePerformanceFilterChange}>
                  <option value="day">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {performanceFilters.dateRange === "custom" && (
                <>
                  <div className="filter-group">
                    <label>Start Date</label>
                    <input type="date" name="startDate" value={performanceFilters.startDate} onChange={handlePerformanceFilterChange} />
                  </div>
                  <div className="filter-group">
                    <label>End Date</label>
                    <input type="date" name="endDate" value={performanceFilters.endDate} onChange={handlePerformanceFilterChange} />
                  </div>
                </>
              )}

              <div className="filter-group">
                <label>Master</label>
                <select name="masterId" value={performanceFilters.masterId} onChange={handlePerformanceFilterChange}>
                  <option value="">All Masters</option>
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button className="btn-apply" onClick={handlePerformanceApply} disabled={loading}>
              Apply Filters
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <div className="master-performance-grid">
                {[...masterPerformanceData]
                  .sort((a, b) => b.revenue_generated - a.revenue_generated)
                  .map((master, index) => (
                    <div key={master.master_id} className="master-card">
                      <div className="card-header">
                        <div className="card-title-section">
                          <div className="master-color-indicator" style={{ backgroundColor: getRandomColor(index) }} />
                          <h3 className="card-title">{master.master_name}</h3>
                        </div>
                      </div>

                      <div className="card-stats">
                        <div className="card-stat">
                          <span className="card-stat-label">Revenue</span>
                          <span className="card-stat-value">{formatCurrency(master.revenue_generated)}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Net Margin</span>
                          <span className="card-stat-value">{formatCurrency(master.net_margin)}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Commission</span>
                          <span className="card-stat-value">{formatCurrency(master.commission)}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Gross Margin</span>
                          <span className="card-stat-value">{formatCurrency(master.gross_margin)}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Completed</span>
                          <span className="card-stat-value">{master.appointments_completed}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Cancelled</span>
                          <span className="card-stat-value">{master.appointments_cancelled}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Planned</span>
                          <span className="card-stat-value">{master.appointments_planned}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Hours</span>
                          <span className="card-stat-value">{parseFloat(master.hours_worked || 0).toFixed(1)}h</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Rev/Hour</span>
                          <span className="card-stat-value">{formatCurrency(master.revenue_per_hour)}</span>
                        </div>
                        <div className="card-stat">
                          <span className="card-stat-label">Margin %</span>
                          <span className="card-stat-value">{formatPercent(master.margin_percent)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {masterPerformanceData.length === 0 && (
                <div className="empty-state">
                  <p>No masters found</p>
                </div>
              )}

              {/* RETURNED: Detailed table at bottom */}
              {masterPerformanceData.length > 0 && (
                <div className="table-section">
                  <h3>Detailed Performance</h3>
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
                        {[...masterPerformanceData]
                          .sort((a, b) => b.revenue_generated - a.revenue_generated)
                          .map((m) => (
                            <tr key={m.master_id}>
                              <td><strong>{m.master_name}</strong></td>
                              <td>{formatCurrency(m.revenue_generated)}</td>
                              <td>{formatCurrency(m.commission)}</td>
                              <td>{formatCurrency(m.gross_margin)}</td>
                              <td>{formatCurrency(m.net_margin)}</td>
                              <td className="text-center">{m.appointments_completed}</td>
                              <td className="text-center text-danger">{m.appointments_cancelled}</td>
                              <td className="text-center">{m.appointments_planned}</td>
                              <td>{parseFloat(m.hours_worked || 0).toFixed(1)}</td>
                              <td>{formatCurrency(m.revenue_per_hour)}</td>
                              <td>{formatPercent(m.margin_percent)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Revenue */}
      {activeTab === "revenue" && (
        <div className="report-section">
          {/* Header row: export + date filter in ONE line */}
          <div className="report-header report-header-row">
            <div className="report-header-left">
              <h2>Revenue Report</h2>
            </div>

            <div className="report-header-right">
              {showDateFilter && (
                <div className="date-filter date-filter-compact">
                  <input type="date" name="from" value={dateRange.from} onChange={handleDateChange} className="date-input" />
                  <span className="date-separator">–</span>
                  <input type="date" name="to" value={dateRange.to} onChange={handleDateChange} className="date-input" />
                  <button className="btn-apply" onClick={handleApply} disabled={loading}>
                    Apply
                  </button>
                </div>
              )}

              <button className="btn-secondary" onClick={exportRevenueExcel} disabled={loading}>
                Export to Excel
              </button>
            </div>
          </div>

          <div className="revenue-tabs">
            <button className={`tab-btn ${revenueTab === "master" ? "active" : ""}`} onClick={() => setRevenueTab("master")}>
              By Master
            </button>
            <button className={`tab-btn ${revenueTab === "service" ? "active" : ""}`} onClick={() => setRevenueTab("service")}>
              By Service
            </button>
            <button className={`tab-btn ${revenueTab === "day" ? "active" : ""}`} onClick={() => setRevenueTab("day")}>
              By Day
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : revenueTab === "master" ? (
            revenueByMaster.length > 0 ? (
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>Master</th>
                    <th>Revenue</th>
                    <th>Appointments</th>
                    <th>Avg per Apt</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByMaster.map((m) => {
                    const avgPerApt = m.appointments_completed > 0 ? m.revenue / m.appointments_completed : 0;
                    return (
                      <tr key={m.master_id}>
                        <td className="cell-name">{m.master_name}</td>
                        <td className="cell-amount">${parseFloat(m.revenue || 0).toFixed(2)}</td>
                        <td className="cell-center">{m.appointments_completed}</td>
                        <td className="cell-amount">${avgPerApt.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">No data available</div>
            )
          ) : revenueTab === "service" ? (
            revenueByService.length > 0 ? (
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Revenue</th>
                    <th>Times Sold</th>
                    <th>Avg per Sale</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByService.map((s) => {
                    const avgPerSale = s.times_sold > 0 ? s.revenue / s.times_sold : 0;
                    return (
                      <tr key={s.service_id}>
                        <td className="cell-name">{s.service_name}</td>
                        <td className="cell-amount">${parseFloat(s.revenue || 0).toFixed(2)}</td>
                        <td className="cell-center">{s.times_sold}</td>
                        <td className="cell-amount">${avgPerSale.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">No data available</div>
            )
          ) : revenueByDay.length > 0 ? (
            <table className="revenue-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Revenue</th>
                  <th>Appointments</th>
                </tr>
              </thead>
              <tbody>
                {revenueByDay.map((d) => (
                  <tr key={d.revenue_date}>
                    <td className="cell-name">{new Date(d.revenue_date).toLocaleDateString()}</td>
                    <td className="cell-amount">${parseFloat(d.revenue || 0).toFixed(2)}</td>
                    <td className="cell-center">{d.appointments_completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No data available</div>
          )}
        </div>
      )}

      {/* COGS */}
      {activeTab === "cogs" && (
        <div className="report-section">
          {/* Header row: export + date filter in ONE line */}
          <div className="report-header report-header-row">
            <div className="report-header-left">
              <h2>COGS Report</h2>
            </div>

            <div className="report-header-right">
              {showDateFilter && (
                <div className="date-filter date-filter-compact">
                  <input type="date" name="from" value={dateRange.from} onChange={handleDateChange} className="date-input" />
                  <span className="date-separator">–</span>
                  <input type="date" name="to" value={dateRange.to} onChange={handleDateChange} className="date-input" />
                  <button className="btn-apply" onClick={handleApply} disabled={loading}>
                    Apply
                  </button>
                </div>
              )}

              <button className="btn-secondary" onClick={exportCogsExcel} disabled={loading}>
                Export to Excel
              </button>
            </div>
          </div>

          {cogsSummary && (
            <div className="summary-cards">
              <div className="card card-revenue">
                <div className="card-label">Total Revenue</div>
                <div className="card-value">${parseFloat(cogsSummary.total_revenue || 0).toFixed(2)}</div>
                <div className="card-subtitle">{cogsSummary.total_transactions} transactions</div>
              </div>

              <div className="card card-check">
                <div className="card-label">Total COGS</div>
                <div className="card-value">${parseFloat(cogsSummary.total_cogs || 0).toFixed(2)}</div>
                <div className="card-subtitle">{parseFloat(cogsSummary.avg_gross_margin_percent || 0).toFixed(1)}% margin</div>
              </div>

              <div className="card card-cancelled">
                <div className="card-label">Gross Margin</div>
                <div className="card-value">${parseFloat(cogsSummary.total_gross_margin || 0).toFixed(2)}</div>
                <div className="card-subtitle">Net: ${parseFloat(cogsSummary.total_net_margin || 0).toFixed(2)}</div>
              </div>
            </div>
          )}

          <div className="revenue-tabs">
            <button className={`tab-btn ${cogsTab === "master" ? "active" : ""}`} onClick={() => setCogsTab("master")}>
              By Master
            </button>
            <button className={`tab-btn ${cogsTab === "service" ? "active" : ""}`} onClick={() => setCogsTab("service")}>
              By Service
            </button>
            <button className={`tab-btn ${cogsTab === "date" ? "active" : ""}`} onClick={() => setCogsTab("date")}>
              By Date
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : cogsReportData.length > 0 ? (
            <table className="revenue-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Transactions</th>
                  <th>Revenue</th>
                  <th>COGS</th>
                  <th>Gross Margin</th>
                  <th>Net Margin</th>
                  <th>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {cogsReportData.map((row, idx) => (
                  <tr key={idx}>
                    <td className="cell-name">{row.group_name}</td>
                    <td className="cell-center">{row.transactions}</td>
                    <td className="cell-amount">${parseFloat(row.revenue || 0).toFixed(2)}</td>
                    <td className="cell-amount">${parseFloat(row.cogs || 0).toFixed(2)}</td>
                    <td className="cell-amount">${parseFloat(row.gross_margin || 0).toFixed(2)}</td>
                    <td className="cell-amount">${parseFloat(row.net_margin || 0).toFixed(2)}</td>
                    <td className="cell-center">{parseFloat(row.avg_gross_margin_percent || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No data available</div>
          )}
        </div>
      )}

      {report && false}
    </div>
  );
}