import { useState, useEffect, useMemo, useRef } from "react";
import { fetchMasters, fetchMyMaster } from "../api/api";
import {
  getRevenueByMaster,
  getRevenueByService,
  getRevenueByDay,
  getCogsReport,
} from "../api/reportsApi";
import { getMasterPerformance } from "../api/masterStatsApi";
import { toAbsoluteUploadUrl } from "../api/uploadApi";
import "./Reports.css";

const AVATAR_SIZE = 54;
function AvatarCell({ url, alt }) {
  return url ? (
    <img
      src={toAbsoluteUploadUrl(url)}
      alt={alt}
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid rgba(0, 80, 103, 0.20)",
        display: "block",
        margin: "0 auto",
      }}
      loading="lazy"
      className="master-photo-img"
    />
  ) : (
    <div
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: "50%",
        background: "#f3f4f6",
        border: "2px dashed rgba(0, 80, 103, 0.20)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto",
        color: "#9ca3af",
        fontWeight: 700,
        fontSize: 12,
      }}
      title="No photo"
      className="master-photo-placeholder"
    >
      —
    </div>
  );
}

function LineChartBG({ children }) {
  return (
    <div className="reports-chart-bg">
      {children}
    </div>
  );
}

function LineChart({ data, labelKey, valueKey, color = "#b96c86" }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const height = 220;
  const pad = 32;

  useEffect(() => {
    function updateWidth() {
      setWidth(containerRef.current ? containerRef.current.offsetWidth : 1200);
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [data]);

  if (!Array.isArray(data) || data.length === 0) return null;
  const maxValue = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  const points = data.map((item, idx) => {
    const x = pad + ((width - pad * 2) * idx) / Math.max(data.length - 1, 1);
    const y = pad + (height - pad * 2) * (1 - (Number(item[valueKey]) || 0) / maxValue);
    return { x, y, label: item[labelKey], value: Number(item[valueKey]) || 0 };
  });

  // Отделяем длинные подписи пробелами для мастеров и переносим
  const labels = points.map(p =>
    p.label
      .replace(/([a-z])([A-ZА-ЯЁ])/g, '$1 $2') // пробел между разными регистрами
      .replace(/([a-zA-Zа-яё])([А-ЯЁ])/g, '$1 $2') // аналогично для кириллицы
  );

  let labelSteps = 1;
  if (points.length > 20) labelSteps = Math.ceil(points.length / 12);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block", width: "100%", background: "transparent" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => {
          const y = pad + (height - pad * 2) * v;
          return (
            <line
              key={i}
              x1={pad}
              x2={width - pad}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
          );
        })}
        {/* Line */}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth={3}
            points={points.map(p => `${p.x},${p.y}`).join(" ")}
          />
        )}
        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={color}
            stroke="#fff"
            strokeWidth={1}
          />
        ))}
        {/* Value label for last point */}
        {points.length > 0 && (
          <text
            x={points[points.length - 1].x - 34}
            y={points[points.length - 1].y - 8}
            fontSize={15}
            fontWeight={600}
            fill={color}
          >
            {points[points.length - 1].value}
          </text>
        )}
      </svg>
      {/* X labels */}
      <div className="reports-chart-labels">
        {labels.map((lbl, i) =>
          i % labelSteps === 0 ? (
            <span key={i}>{lbl}</span>
          ) : (
            <span key={i} />
          )
        )}
      </div>
    </div>
  );
}

function LineChartCOGS({ data, labelKey, revenueKey = "revenue", cogsKey = "cogs" }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const height = 220;
  const pad = 32;

  useEffect(() => {
    function updateWidth() {
      setWidth(containerRef.current ? containerRef.current.offsetWidth : 1200);
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [data]);

  if (!Array.isArray(data) || data.length === 0) return null;
  const maxValue = Math.max(...data.map(d => Math.max(Number(d[revenueKey]) || 0, Number(d[cogsKey]) || 0)), 1);
  const points = data.map((item, idx) => {
    const x = pad + ((width - pad * 2) * idx) / Math.max(data.length - 1, 1);
    const revenue = Number(item[revenueKey]) || 0;
    const cogs = Number(item[cogsKey]) || 0;
    return {
      x,
      yRevenue: pad + (height - pad * 2) * (1 - revenue / maxValue),
      yCogs: pad + (height - pad * 2) * (1 - cogs / maxValue),
      label: item[labelKey],
      revenue,
      cogs,
    };
  });

  const labels = points.map(p => p.label);

  let labelSteps = 1;
  if (points.length > 20) labelSteps = Math.ceil(points.length / 12);

  const revenueColor = "var(--nav-accent-2)";
  const cogsColor = "var(--nav-accent)";

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg width={width} height={height} style={{ display: "block", width: "100%", background: "transparent" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => {
          const y = pad + (height - pad * 2) * v;
          return (
            <line
              key={i}
              x1={pad}
              x2={width - pad}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
          );
        })}
        {/* Revenue Line */}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={revenueColor}
            strokeWidth={3}
            points={points.map(p => `${p.x},${p.yRevenue}`).join(" ")}
          />
        )}
        {/* COGS Line */}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={cogsColor}
            strokeWidth={3}
            strokeDasharray="5,4"
            opacity={0.9}
            points={points.map(p => `${p.x},${p.yCogs}`).join(" ")}
          />
        )}
        {/* Points */}
        {points.map((p, i) => (
          <>
            <circle
              key={"rev-" + i}
              cx={p.x}
              cy={p.yRevenue}
              r={4}
              fill={revenueColor}
              stroke="#fff"
              strokeWidth={1}
            />
            <circle
              key={"cogs-" + i}
              cx={p.x}
              cy={p.yCogs}
              r={4}
              fill={cogsColor}
              stroke="#fff"
              strokeWidth={1}
            />
          </>
        ))}
        {/* value label for last points */}
        {points.length > 0 && (
          <>
            <text
              x={points[points.length - 1].x - 34}
              y={points[points.length - 1].yRevenue - 8}
              fontSize={15}
              fontWeight={600}
              fill={revenueColor}
            >
              {points[points.length - 1].revenue}
            </text>
            <text
              x={points[points.length - 1].x - 34}
              y={points[points.length - 1].yCogs + 20}
              fontSize={15}
              fontWeight={600}
              fill={cogsColor}
            >
              {points[points.length - 1].cogs}
            </text>
          </>
        )}
      </svg>
      {/* X labels */}
      <div className="reports-chart-labels">
        {labels.map((lbl, i) =>
          i % labelSteps === 0 ? (
            <span key={i}>{lbl}</span>
          ) : (
            <span key={i} />
          )
        )}
      </div>
      {/* Legend */}
      <div style={{display: 'flex', gap: 32, marginTop: 8, marginLeft: 12, fontWeight: 700, fontSize: 14}}>
        <span style={{color: "var(--nav-accent-2)"}}>● Revenue</span>
        <span style={{color: "var(--nav-accent)"}}>● COGS (dashed)</span>
      </div>
    </div>
  );
}

function decodeToken(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

export default function Reports() {
  const token = localStorage.getItem("token");
  const tokenPayload = useMemo(() => decodeToken(token), [token]);
  const isAdmin = tokenPayload?.role === "admin";
  const isMaster = tokenPayload?.role === "master";

  const [masters, setMasters] = useState([]);
  const [myMaster, setMyMaster] = useState(null);

  const [masterPerformanceData, setMasterPerformanceData] = useState([]);
  const [revenueByMaster, setRevenueByMaster] = useState([]);
  const [revenueByService, setRevenueByService] = useState([]);
  const [revenueByDay, setRevenueByDay] = useState([]);
  const [cogsReportData, setCogsReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("master-performance");
  const [revenueTab, setRevenueTab] = useState("master");
  const [cogsTab, setCogsTab] = useState("master");

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

  const [selectedMasterId, setSelectedMasterId] = useState("");
  const [performanceFromDate, setPerformanceFromDate] = useState(getDefaultFromDate());
  const [performanceToDate, setPerformanceToDate] = useState(getDefaultToDate());

  useEffect(() => {
    if (!isAdmin && activeTab !== "master-performance") {
      setActiveTab("master-performance");
    }
  }, [isAdmin, isMaster]);

  useEffect(() => {
    async function load() {
      if (!token) return;
      if (isAdmin) {
        const data = await fetchMasters(token);
        setMasters(Array.isArray(data) ? data : []);
        setMyMaster(null);
      } else {
        const me = await fetchMyMaster(token);
        setMyMaster(me || null);
        setMasters(me ? [me] : []);
        setSelectedMasterId(me?.id || "");
      }
    }
    load();
  }, [token, isAdmin, isMaster]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const masterId = isAdmin ? selectedMasterId : myMaster?.id;
        const from = performanceFromDate;
        const to = performanceToDate;
        const data = await getMasterPerformance(token, {
          masterId: masterId || undefined,
          startDate: from,
          endDate: to,
        });
        setMasterPerformanceData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load master performance:", err);
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line
  }, [token, isAdmin, selectedMasterId, myMaster?.id, performanceFromDate, performanceToDate]);

  useEffect(() => {
    async function load() {
      if (!isAdmin) return;
      setLoading(true);
      setError("");
      try {
        const from = dateRange.from;
        const to = dateRange.to;
        setRevenueByMaster(await getRevenueByMaster(token, from, to));
        setRevenueByService(await getRevenueByService(token, from, to));
        setRevenueByDay(await getRevenueByDay(token, from, to));
        setCogsReportData(await getCogsReport(token, from, to, cogsTab));
      } catch (err) {
        console.error("Failed to load report:", err);
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line
  }, [token, isAdmin, dateRange.from, dateRange.to, cogsTab]);

  const handleDateChange = (e) => {
    setDateRange(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePerformanceFilters = (e) => {
    const { name, value } = e.target;
    if (name === "masterId") setSelectedMasterId(value);
    else if (name === "performanceFrom") setPerformanceFromDate(value);
    else if (name === "performanceTo") setPerformanceToDate(value);
  };

  const formatCurrency = (value) => `$${parseFloat(value || 0).toFixed(2)}`;

  const getTotals = (data, keys) => {
    const totals = {};
    keys.forEach(k => {
      totals[k] = data.reduce((s, d) => s + (Number(d[k]) || 0), 0);
    });
    return totals;
  };

  return (
    <div className={`reports-container ${isAdmin ? "reports-admin-view" : "reports-master-view"}`}>
      <div className="reports-header-top">
        <h1>Reports</h1>
      </div>
      <div className="reports-tabs">
        <button className={`tab ${activeTab === "master-performance" ? "active" : ""}`} onClick={() => setActiveTab("master-performance")}>
          🧑‍🎤 Master Performance
        </button>
        {isAdmin && (
          <>
            <button className={`tab ${activeTab === "revenue" ? "active" : ""}`} onClick={() => setActiveTab("revenue")}>
              💰 Revenue
            </button>
            <button className={`tab ${activeTab === "cogs" ? "active" : ""}`} onClick={() => setActiveTab("cogs")}>
              📋 COGS
            </button>
          </>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
      {activeTab === "master-performance" && (
        <div className="report-section">
          <div className="report-header report-header-row">
            <div className="report-header-left">
              <h2>Master Performance Report</h2>
            </div>
            <div className="report-header-right">
              <div className="performance-filters-inline">
                {isAdmin && (
                  <div className="filter-group">
                    <label>Master</label>
                    <select name="masterId" value={selectedMasterId} onChange={handlePerformanceFilters}>
                      <option value="">All Masters</option>
                      {masters.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="filter-group">
                  <label>From</label>
                  <input type="date" name="performanceFrom" value={performanceFromDate} onChange={handlePerformanceFilters} />
                </div>
                <div className="filter-group">
                  <label>To</label>
                  <input type="date" name="performanceTo" value={performanceToDate} onChange={handlePerformanceFilters} />
                </div>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <div className="master-performance-grid">
                {masterPerformanceData.map((master) => (
                  <div key={master.master_id} className="master-card">
                    <div className="master-photo">
                      <AvatarCell url={master.photo_url} alt={master.master_name} />
                    </div>
                    <div className="card-title">{master.master_name}</div>
                    <div className="card-stats">
                      <div className="card-stat">
                        <span>Revenue</span>
                        <span>{formatCurrency(master.revenue_generated)}</span>
                      </div>
                      <div className="card-stat">
                        <span>Net Margin</span>
                        <span>{formatCurrency(master.net_margin)}</span>
                      </div>
                      <div className="card-stat">
                        <span>Completed</span>
                        <span>{master.appointments_completed}</span>
                      </div>
                      <div className="card-stat">
                        <span>Cancelled</span>
                        <span>{master.appointments_cancelled}</span>
                      </div>
                      <div className="card-stat">
                        <span>Planned</span>
                        <span>{master.appointments_planned}</span>
                      </div>
                      <div className="card-stat">
                        <span>Hours</span>
                        <span>{parseFloat(master.hours_worked || 0).toFixed(1)}h</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {masterPerformanceData.length > 0 && (
                <div className="table-section">
                  <h3>Results Table</h3>
                  <div className="table-wrapper">
                    <table className="performance-table">
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>Photo</th>
                          <th>Master</th>
                          <th>Revenue</th>
                          <th>Net Margin</th>
                          <th>Completed</th>
                          <th>Cancelled</th>
                          <th>Planned</th>
                          <th>Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {masterPerformanceData.map((m) => (
                          <tr key={m.master_id}>
                            <td>
                              <AvatarCell url={m.photo_url} alt={m.master_name} />
                            </td>
                            <td><strong>{m.master_name}</strong></td>
                            <td>{formatCurrency(m.revenue_generated)}</td>
                            <td>{formatCurrency(m.net_margin)}</td>
                            <td className="text-center">{m.appointments_completed}</td>
                            <td className="text-center text-danger">{m.appointments_cancelled}</td>
                            <td className="text-center">{m.appointments_planned}</td>
                            <td>{parseFloat(m.hours_worked || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td><strong>Total:</strong></td>
                          <td></td>
                          <td>{formatCurrency(getTotals(masterPerformanceData, ["revenue_generated"]).revenue_generated)}</td>
                          <td>{formatCurrency(getTotals(masterPerformanceData, ["net_margin"]).net_margin)}</td>
                          <td>{getTotals(masterPerformanceData, ["appointments_completed"]).appointments_completed}</td>
                          <td>{getTotals(masterPerformanceData, ["appointments_cancelled"]).appointments_cancelled}</td>
                          <td>{getTotals(masterPerformanceData, ["appointments_planned"]).appointments_planned}</td>
                          <td>{parseFloat(getTotals(masterPerformanceData, ["hours_worked"]).hours_worked).toFixed(1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isAdmin && activeTab === "revenue" && (
        <div className="report-section">
          <div className="report-header report-header-row">
            <div className="report-header-left">
              <h2>Revenue Report</h2>
            </div>
            <div className="report-header-right">
              <div className="date-filter-compact">
                <input type="date" name="from" value={dateRange.from} onChange={handleDateChange} />
                <span className="date-separator">–</span>
                <input type="date" name="to" value={dateRange.to} onChange={handleDateChange} />
              </div>
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
          ) : revenueTab === "master" && revenueByMaster.length > 0 ? (
            <>
              <LineChartBG>
                <LineChart
                  data={revenueByMaster}
                  labelKey="master_name"
                  valueKey="revenue"
                  color="var(--nav-accent-2)"
                />
              </LineChartBG>
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
                        <td className="cell-amount">{formatCurrency(m.revenue)}</td>
                        <td className="cell-center">{m.appointments_completed}</td>
                        <td className="cell-amount">{formatCurrency(avgPerApt)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td><strong>Total:</strong></td>
                    <td>{formatCurrency(getTotals(revenueByMaster, ["revenue"]).revenue)}</td>
                    <td>{getTotals(revenueByMaster, ["appointments_completed"]).appointments_completed}</td>
                    <td>{(() => {
                      const t = getTotals(revenueByMaster, ["revenue", "appointments_completed"]);
                      return t.appointments_completed > 0 ? formatCurrency(t.revenue / t.appointments_completed) : "$0.00";
                    })()}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : revenueTab === "service" && revenueByService.length > 0 ? (
            <>
              <LineChartBG>
                <LineChart
                  data={revenueByService}
                  labelKey="service_name"
                  valueKey="revenue"
                  color="var(--nav-accent)"
                />
              </LineChartBG>
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
                        <td className="cell-amount">{formatCurrency(s.revenue)}</td>
                        <td className="cell-center">{s.times_sold}</td>
                        <td className="cell-amount">{formatCurrency(avgPerSale)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td><strong>Total:</strong></td>
                    <td>{formatCurrency(getTotals(revenueByService, ["revenue"]).revenue)}</td>
                    <td>{getTotals(revenueByService, ["times_sold"]).times_sold}</td>
                    <td>{(() => {
                      const t = getTotals(revenueByService, ["revenue", "times_sold"]);
                      return t.times_sold > 0 ? formatCurrency(t.revenue / t.times_sold) : "$0.00";
                    })()}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : revenueTab === "day" && revenueByDay.length > 0 ? (
            <>
              <LineChartBG>
                <LineChart
                  data={revenueByDay.map(d => ({
                    ...d,
                    revenue_date: new Date(d.revenue_date).toLocaleDateString()
                  }))}
                  labelKey="revenue_date"
                  valueKey="revenue"
                  color="var(--nav-bg)"
                />
              </LineChartBG>
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
                      <td className="cell-amount">{formatCurrency(d.revenue)}</td>
                      <td className="cell-center">{d.appointments_completed}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total:</strong></td>
                    <td>{formatCurrency(getTotals(revenueByDay, ["revenue"]).revenue)}</td>
                    <td>{getTotals(revenueByDay, ["appointments_completed"]).appointments_completed}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty-state">No data available</div>
          )}
        </div>
      )}
      {isAdmin && activeTab === "cogs" && (
        <div className="report-section">
          <div className="report-header report-header-row">
            <div className="report-header-left">
              <h2>COGS Report</h2>
            </div>
            <div className="report-header-right">
              <div className="date-filter-compact">
                <input type="date" name="from" value={dateRange.from} onChange={handleDateChange} />
                <span className="date-separator">–</span>
                <input type="date" name="to" value={dateRange.to} onChange={handleDateChange} />
              </div>
            </div>
          </div>
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
            <div className="loading">Loading COGS...</div>
          ) : cogsReportData.length > 0 ? (
            <>
              <LineChartBG>
                <LineChartCOGS
                  data={cogsReportData.map(r => ({
                    ...r,
                    group_name:
                      cogsTab === "date"
                        ? new Date(r.group_name).toLocaleDateString()
                        : r.group_name
                  }))}
                  labelKey="group_name"
                  revenueKey="revenue"
                  cogsKey="cogs"
                />
              </LineChartBG>
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
                  {cogsReportData.map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.group_name}</td>
                      <td>{r.transactions}</td>
                      <td>{formatCurrency(r.revenue)}</td>
                      <td>{formatCurrency(r.cogs)}</td>
                      <td>{formatCurrency(r.gross_margin)}</td>
                      <td>{formatCurrency(r.net_margin)}</td>
                      <td>{parseFloat(r.avg_gross_margin_percent || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total:</strong></td>
                    <td>{getTotals(cogsReportData, ["transactions"]).transactions}</td>
                    <td>{formatCurrency(getTotals(cogsReportData, ["revenue"]).revenue)}</td>
                    <td>{formatCurrency(getTotals(cogsReportData, ["cogs"]).cogs)}</td>
                    <td>{formatCurrency(getTotals(cogsReportData, ["gross_margin"]).gross_margin)}</td>
                    <td>{formatCurrency(getTotals(cogsReportData, ["net_margin"]).net_margin)}</td>
                    <td>{parseFloat(getTotals(cogsReportData, ["avg_gross_margin_percent"]).avg_gross_margin_percent).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty-state">No COGS data available</div>
          )}
        </div>
      )}
    </div>
  );
}