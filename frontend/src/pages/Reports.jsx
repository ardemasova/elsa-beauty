import { useState, useEffect } from "react";
import { fetchMasters } from "../api/api";
import {
  getSummaryAll,
  getRevenueByMaster,
  getRevenueByService,
  getRevenueByDay,
  getCogsReport,
  getCogsSummary,
  exportToCSV
} from "../api/reportsApi";
import { getMasterPerformance, exportToExcel } from "../api/masterStatsApi";
import "./Reports.css";

export default function Reports() {
  const [masters, setMasters] = useState([]);
  const [report, setReport] = useState(null);
  const [masterPerformanceData, setMasterPerformanceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReport, setSelectedReport] = useState("master-performance");
  const token = localStorage.getItem("token");
  
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

  const [revenueTab, setRevenueTab] = useState("master");
  const [revenueByMaster, setRevenueByMaster] = useState([]);
  const [revenueByService, setRevenueByService] = useState([]);
  const [revenueByDay, setRevenueByDay] = useState([]);

    const [cogsTab, setCogsTab] = useState("master");
  const [cogsSummary, setCogsSummary] = useState(null);
  const [cogsReportData, setCogsReportData] = useState([]);
  function getDefaultFromDate() {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split("T")[0];
  }

  function getDefaultToDate() {
    const date = new Date();
    return date.toISOString().split("T")[0];
  }

  useEffect(() => {
    loadMasters();
    loadReport();
    loadMasterPerformance();
  }, []);

  const loadMasters = async () => {
    try {
      const data = await fetchMasters(token);
      setMasters(data);
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
      
      // Загружаем revenue данные
      const byMaster = await getRevenueByMaster(token, dateRange.from, dateRange.to);
      const byService = await getRevenueByService(token, dateRange.from, dateRange.to);
      const byDay = await getRevenueByDay(token, dateRange.from, dateRange.to);
      
      setRevenueByMaster(byMaster);
      setRevenueByService(byService);
      setRevenueByDay(byDay);

      // Загружаем COGS данные
      const cogsSummaryData = await getCogsSummary(token, dateRange.from, dateRange.to);
      setCogsSummary(cogsSummaryData);
      
      const cogsByMaster = await getCogsReport(token, dateRange.from, dateRange.to, 'master');
      setCogsReportData(cogsByMaster);
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
        filters.startDate = startOfDay.toISOString().split('T')[0];
        filters.endDate = today.toISOString().split('T')[0];
      } else if (performanceFilters.dateRange === "week") {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        filters.startDate = startOfWeek.toISOString().split('T')[0];
        filters.endDate = today.toISOString().split('T')[0];
      } else if (performanceFilters.dateRange === "month") {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        filters.startDate = startOfMonth.toISOString().split('T')[0];
        filters.endDate = today.toISOString().split('T')[0];
      } else if (performanceFilters.dateRange === "custom") {
        if (performanceFilters.startDate) filters.startDate = performanceFilters.startDate;
        if (performanceFilters.endDate) filters.endDate = performanceFilters.endDate;
      }

      const data = await getMasterPerformance(token, filters);
      setMasterPerformanceData(data);
    } catch (err) {
      console.error("Failed to load master performance:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePerformanceFilterChange = (e) => {
    const { name, value } = e.target;
    setPerformanceFilters(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleApply = () => {
    loadReport();
  };

  const handlePerformanceApply = () => {
    loadMasterPerformance();
  };

  const reportsList = [
    { id: "master-performance", label: "Master Performance Report", icon: "📊" },
    { id: "revenue", label: "Revenue Report", icon: "💰" },
    { id: "cogs", label: "COGS Report", icon: "📋" },
  ];

  const getRandomColor = (index) => {
    const colors = [
      "#3B82F6",
      "#EF4444",
      "#10B981",
      "#F59E0B",
      "#8B5CF6",
      "#EC4899",
      "#14B8A6",
      "#F97316",
    ];
    return colors[index % colors.length];
  };

  const formatCurrency = (value) => {
    return `$${parseFloat(value || 0).toFixed(2)}`;
  };

  const formatPercent = (value) => {
    return `${parseFloat(value || 0).toFixed(1)}%`;
  };

  return (
    <div className="reports-container">
      <div className="reports-header-top">
        <h1>Reports</h1>
        {selectedReport !== "master-performance" && (
          <div className="date-filter">
            <input
              type="date"
              name="from"
              value={dateRange.from}
              onChange={handleDateChange}
              className="date-input"
            />
            <span className="date-separator">–</span>
            <input
              type="date"
              name="to"
              value={dateRange.to}
              onChange={handleDateChange}
              className="date-input"
            />
            <button className="btn-apply" onClick={handleApply}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Report Selector */}
      <div className="reports-selector">
        {reportsList.map((item) => (
          <button
            key={item.id}
            className={`report-btn ${selectedReport === item.id ? "active" : ""}`}
            onClick={() => setSelectedReport(item.id)}
          >
            <span className="report-icon">{item.icon}</span>
            <span className="report-label">{item.label}</span>
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Master Performance Report */}
      {selectedReport === "master-performance" && (
        <div className="report-section">
          <div className="report-header">
            <h2>Master Performance Report</h2>
            <button 
              className="btn-export"
              onClick={() => exportToExcel(masterPerformanceData, `master-performance-${new Date().toISOString().split('T')[0]}.csv`)}
              disabled={masterPerformanceData.length === 0}
            >
              📥 Export to CSV
            </button>
          </div>

                    {/* Фильтры */}
          <div className="performance-filters">
            <div className="filters-row">
              <div className="filter-group">
                <label>Date Range</label>
                <select 
                  name="dateRange"
                  value={performanceFilters.dateRange}
                  onChange={handlePerformanceFilterChange}
                >
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
                    <input 
                      type="date" 
                      name="startDate"
                      value={performanceFilters.startDate}
                      onChange={handlePerformanceFilterChange}
                    />
                  </div>
                  <div className="filter-group">
                    <label>End Date</label>
                    <input 
                      type="date" 
                      name="endDate"
                      value={performanceFilters.endDate}
                      onChange={handlePerformanceFilterChange}
                    />
                  </div>
                </>
              )}

              <div className="filter-group">
                <label>Master</label>
                <select 
                  name="masterId"
                  value={performanceFilters.masterId}
                  onChange={handlePerformanceFilterChange}
                >
                  <option value="">All Masters</option>
                  {masters.map(master => (
                    <option key={master.id} value={master.id}>
                      {master.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button 
              className="btn-apply"
              onClick={handlePerformanceApply}
            >
              Apply Filters
            </button>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              {/* Карточки мастеров - отсортированные по revenue */}
              <div className="master-performance-grid">
                {[...masterPerformanceData].sort((a, b) => b.revenue_generated - a.revenue_generated).map((master, index) => (
                  <div key={master.master_id} className="master-card">
                    <div className="card-header">
                      <div className="card-title-section">
                        <div
                          className="master-color-indicator"
                          style={{ backgroundColor: getRandomColor(index) }}
                        />
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

              {/* Таблица */}
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
                        {[...masterPerformanceData].sort((a, b) => b.revenue_generated - a.revenue_generated).map(master => (
                          <tr key={master.master_id}>
                            <td><strong>{master.master_name}</strong></td>
                            <td>{formatCurrency(master.revenue_generated)}</td>
                            <td>{formatCurrency(master.commission)}</td>
                            <td>{formatCurrency(master.gross_margin)}</td>
                            <td>{formatCurrency(master.net_margin)}</td>
                            <td className="text-center">{master.appointments_completed}</td>
                            <td className="text-center text-danger">{master.appointments_cancelled}</td>
                            <td className="text-center">{master.appointments_planned}</td>
                            <td>{parseFloat(master.hours_worked || 0).toFixed(1)}</td>
                            <td>{formatCurrency(master.revenue_per_hour)}</td>
                            <td>{formatPercent(master.margin_percent)}</td>
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

            {/* COGS Report */}
      {selectedReport === "cogs" && (
        <div className="report-section">
          <div className="report-header">
            <h2>COGS Report</h2>
            <p className="report-subtitle">Cost of Goods Sold analysis</p>
          </div>

          {/* Summary Cards */}
          {cogsSummary && (
            <div className="summary-cards">
              <div className="card card-revenue">
                <div className="card-label">Total Revenue</div>
                <div className="card-value">
                  ${parseFloat(cogsSummary.total_revenue || 0).toFixed(2)}
                </div>
                <div className="card-subtitle">
                  {cogsSummary.total_transactions} transactions
                </div>
              </div>

              <div className="card card-check">
                <div className="card-label">Total COGS</div>
                <div className="card-value">
                  ${parseFloat(cogsSummary.total_cogs || 0).toFixed(2)}
                </div>
                <div className="card-subtitle">
                  {parseFloat(cogsSummary.avg_gross_margin_percent || 0).toFixed(1)}% margin
                </div>
              </div>

              <div className="card card-cancelled">
                <div className="card-label">Gross Margin</div>
                <div className="card-value">
                  ${parseFloat(cogsSummary.total_gross_margin || 0).toFixed(2)}
                </div>
                <div className="card-subtitle">
                  Net: ${parseFloat(cogsSummary.total_net_margin || 0).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Tabs для разных группировок */}
          <div className="revenue-tabs">
            <button 
              className={`tab-btn ${cogsTab === 'master' ? 'active' : ''}`}
              onClick={() => setCogsTab('master')}
            >
              By Master
            </button>
            <button 
              className={`tab-btn ${cogsTab === 'service' ? 'active' : ''}`}
              onClick={() => setCogsTab('service')}
            >
              By Service
            </button>
            <button 
              className={`tab-btn ${cogsTab === 'date' ? 'active' : ''}`}
              onClick={() => setCogsTab('date')}
            >
              By Date
            </button>
          </div>

          {/* COGS by Master */}
          {cogsTab === 'master' && (
            <div className="revenue-content">
              <div className="revenue-export">
                <button 
                  className="btn-export"
                  onClick={async () => {
                    const data = await getCogsReport(token, dateRange.from, dateRange.to, 'master');
                    exportToCSV(
                      data, 
                      `cogs-by-master-${new Date().toISOString().split('T')[0]}.csv`,
                      ['group_name', 'transactions', 'revenue', 'cogs', 'gross_margin', 'net_margin', 'avg_gross_margin_percent']
                    );
                  }}
                >
                  📥 Export to CSV
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : cogsReportData.length > 0 ? (
                <table className="revenue-table">
                  <thead>
                    <tr>
                      <th>Master</th>
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

          {/* COGS by Service */}
          {cogsTab === 'service' && (
            <div className="revenue-content">
              <div className="revenue-export">
                <button 
                  className="btn-export"
                  onClick={async () => {
                    const data = await getCogsReport(token, dateRange.from, dateRange.to, 'service');
                    exportToCSV(
                      data, 
                      `cogs-by-service-${new Date().toISOString().split('T')[0]}.csv`,
                      ['group_name', 'transactions', 'revenue', 'cogs', 'gross_margin', 'net_margin', 'avg_gross_margin_percent']
                    );
                  }}
                >
                  📥 Export to CSV
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : (
                <>
                  {!cogsReportData.length || cogsReportData[0].group_name === cogsReportData[0].group_name ? (
                    <div className="cogs-loading">Loading service data...</div>
                  ) : (
                    <table className="revenue-table">
                      <thead>
                        <tr>
                          <th>Service</th>
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
                  )}
                </>
              )}
            </div>
          )}

          {/* COGS by Date */}
          {cogsTab === 'date' && (
            <div className="revenue-content">
              <div className="revenue-export">
                <button 
                  className="btn-export"
                  onClick={async () => {
                    const data = await getCogsReport(token, dateRange.from, dateRange.to, 'date');
                    exportToCSV(
                      data, 
                      `cogs-by-date-${new Date().toISOString().split('T')[0]}.csv`,
                      ['group_name', 'transactions', 'revenue', 'cogs', 'gross_margin', 'net_margin', 'avg_gross_margin_percent']
                    );
                  }}
                >
                  📥 Export to CSV
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : (
                <div className="cogs-loading">Loading date data...</div>
              )}
            </div>
          )}
        </div>
      )}

            {/* Revenue Report */}
      {selectedReport === "revenue" && (
        <div className="report-section">
          <div className="report-header">
            <h2>Revenue Report</h2>
            <p className="report-subtitle">Revenue analysis by master, service and day</p>
          </div>

          {/* Tabs для разных view */}
          <div className="revenue-tabs">
            <button 
              className={`tab-btn ${revenueTab === 'master' ? 'active' : ''}`}
              onClick={() => setRevenueTab('master')}
            >
              By Master
            </button>
            <button 
              className={`tab-btn ${revenueTab === 'service' ? 'active' : ''}`}
              onClick={() => setRevenueTab('service')}
            >
              By Service
            </button>
            <button 
              className={`tab-btn ${revenueTab === 'day' ? 'active' : ''}`}
              onClick={() => setRevenueTab('day')}
            >
              By Day
            </button>
          </div>

          {/* Revenue by Master */}
          {revenueTab === 'master' && (
            <div className="revenue-content">
              <div className="revenue-export">
                <button 
                  className="btn-export"
                  onClick={() => exportToCSV(
                    revenueByMaster, 
                    `revenue-by-master-${new Date().toISOString().split('T')[0]}.csv`,
                    ['master_name', 'revenue', 'appointments_completed']
                  )}
                  disabled={revenueByMaster.length === 0}
                >
                  📥 Export to CSV
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : revenueByMaster.length > 0 ? (
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
                    {revenueByMaster.map((master) => {
                      const avgPerApt = master.appointments_completed > 0 
                        ? master.revenue / master.appointments_completed 
                        : 0;
                      
                      return (
                        <tr key={master.master_id}>
                          <td className="cell-name">{master.master_name}</td>
                          <td className="cell-amount">${parseFloat(master.revenue).toFixed(2)}</td>
                          <td className="cell-center">{master.appointments_completed}</td>
                          <td className="cell-amount">${avgPerApt.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">No data available</div>
              )}
            </div>
          )}

          {/* Revenue by Service */}
          {revenueTab === 'service' && (
            <div className="revenue-content">
              <div className="revenue-export">
                <button 
                  className="btn-export"
                  onClick={() => exportToCSV(
                    revenueByService, 
                    `revenue-by-service-${new Date().toISOString().split('T')[0]}.csv`,
                    ['service_name', 'revenue', 'times_sold']
                  )}
                  disabled={revenueByService.length === 0}
                >
                  📥 Export to CSV
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
              ) : revenueByService.length > 0 ? (
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
                    {revenueByService.map((service) => {
                      const avgPerSale = service.times_sold > 0 
                        ? service.revenue / service.times_sold 
                        : 0;
                      
                      return (
                        <tr key={service.service_id}>
                          <td className="cell-name">{service.service_name}</td>
                          <td className="cell-amount">${parseFloat(service.revenue).toFixed(2)}</td>
                          <td className="cell-center">{service.times_sold}</td>
                          <td className="cell-amount">${avgPerSale.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">No data available</div>
              )}
            </div>
          )}

          {/* Revenue by Day */}
          {revenueTab === 'day' && (
            <div className="revenue-content">
              <div className="revenue-export">
                <button 
                  className="btn-export"
                  onClick={() => exportToCSV(
                    revenueByDay, 
                    `revenue-by-day-${new Date().toISOString().split('T')[0]}.csv`,
                    ['revenue_date', 'revenue', 'appointments_completed']
                  )}
                  disabled={revenueByDay.length === 0}
                >
                  📥 Export to CSV
                </button>
              </div>

              {loading ? (
                <div className="loading">Loading...</div>
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
                    {revenueByDay.map((day) => (
                      <tr key={day.revenue_date}>
                        <td className="cell-name">{new Date(day.revenue_date).toLocaleDateString()}</td>
                        <td className="cell-amount">${parseFloat(day.revenue).toFixed(2)}</td>
                        <td className="cell-center">{day.appointments_completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">No data available</div>
              )}
            </div>
          )}
        </div>
      )}
       </div>
  );
}