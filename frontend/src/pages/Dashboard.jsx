import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAppointmentsByDateRange, fetchMasters, fetchClients, fetchServices, fetchMyMaster } from "../api/api";

import StatsWidget from "./components/StatsWidget";
import CreateAppointmentModal from "./components/CreateAppointmentModal";

import revenueIcon from "../assets/icons/revenue.svg";
import appointmentsIcon from "../assets/icons/app-icon.svg";
import avgCheckIcon from "../assets/icons/avg-check.svg";
import topMasterIcon from "../assets/icons/top-master.svg";

import "./Dashboard.css";

function decodeToken(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

// --- small helpers for chart ---
const formatCurrencyShort = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

const formatCurrency = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export default function Dashboard() {
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  const [appointments, setAppointments] = useState([]);
  const [period, setPeriod] = useState("week");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const token = localStorage.getItem("token");

  const tokenPayload = useMemo(() => decodeToken(token), [token]);
  const role = tokenPayload?.role;
  const userEmail = tokenPayload?.email;
  const userId = tokenPayload?.userId;
  const isAdmin = role === "admin";
  const isMaster = role === "master";

  // Filters
  const [masters, setMasters] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedMasters, setSelectedMasters] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);

  // Filter dropdown visibility
  const [showMasterFilter, setShowMasterFilter] = useState(false);
  const [showClientFilter, setShowClientFilter] = useState(false);
  const [showServiceFilter, setShowServiceFilter] = useState(false);

  // Date navigation
  const [currentDate, setCurrentDate] = useState(new Date());

  // Chart hover tooltip
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!token && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate("/login", { replace: true });
      return;
    }

    if (token) {
      loadFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, currentDate, selectedMasters, selectedClients, selectedServices, token]);

  useEffect(() => {
    const handleClickOutside = () => {
      setShowMasterFilter(false);
      setShowClientFilter(false);
      setShowServiceFilter(false);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadFilters = async () => {
    try {
      setError("");

      const clientsData = await fetchClients(token);
      const servicesData = await fetchServices(token);

      setClients(clientsData);
      setServices(servicesData);

      setSelectedClients(clientsData.map((c) => c.id));
      setSelectedServices(servicesData.map((s) => s.id));

      if (isAdmin) {
        const mastersData = await fetchMasters(token);
        setMasters(mastersData);
        setSelectedMasters(mastersData.map((m) => m.id));
      } else {
        try {
          const me = await fetchMyMaster(token);
          setMasters(me ? [me] : []);
          setSelectedMasters(me?.id ? [me.id] : []);
        } catch (e) {
          console.error("Failed to fetch /masters/me:", e);
          setMasters([]);
          setSelectedMasters([]);
          setError(e?.message || "Master profile not found. Ask admin to create master profile in this branch/schema.");
        }
      }
    } catch (err) {
      console.error("Failed to load filters:", err);
      setError(err.message || "Failed to load filters");
    }
  };

  const getDateRangeForAPI = () => {
    const date = new Date(currentDate);

    if (period === "day") {
      const start = date.toISOString().split("T")[0];
      const end = date.toISOString().split("T")[0];
      return { start, end };
    } else if (period === "week") {
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    } else if (period === "month") {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }

    const start = date.toISOString().split("T")[0];
    return { start, end: start };
  };

  const getDateRangeText = () => {
    const date = new Date(currentDate);

    if (period === "day") {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } else if (period === "week") {
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const startStr = start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const endStr = end.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return `${startStr} – ${endStr}`;
    } else if (period === "month") {
      return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
  };

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (period === "day") newDate.setDate(newDate.getDate() - 1);
    else if (period === "week") newDate.setDate(newDate.getDate() - 7);
    else if (period === "month") newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (period === "day") newDate.setDate(newDate.getDate() + 1);
    else if (period === "week") newDate.setDate(newDate.getDate() + 7);
    else if (period === "month") newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => setCurrentDate(new Date());

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    setCurrentDate(new Date());
  };

  const toggleMaster = (masterId) => {
    if (!isAdmin) return;
    setSelectedMasters((prev) => (prev.includes(masterId) ? prev.filter((id) => id !== masterId) : [...prev, masterId]));
  };

  const toggleClient = (clientId) => {
    setSelectedClients((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]));
  };

  const toggleService = (serviceId) => {
    setSelectedServices((prev) => (prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]));
  };

  const toggleAllMasters = () => {
    if (!isAdmin) return;
    if (selectedMasters.length === masters.length) setSelectedMasters([]);
    else setSelectedMasters(masters.map((m) => m.id));
  };

  const toggleAllClients = () => {
    if (selectedClients.length === clients.length) setSelectedClients([]);
    else setSelectedClients(clients.map((c) => c.id));
  };

  const toggleAllServices = () => {
    if (selectedServices.length === services.length) setSelectedServices([]);
    else setSelectedServices(services.map((s) => s.id));
  };

  const loadData = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const dateRange = getDateRangeForAPI();
      const appointmentsData = await getAppointmentsByDateRange(token, dateRange.start, dateRange.end);
      setAppointments(Array.isArray(appointmentsData) ? appointmentsData : []);
      setError("");
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  // ---- Revenue derived from appointments + services ----
  const serviceMap = useMemo(() => {
    const map = {};
    services.forEach((s) => {
      map[s.id] = Number(s.price) || 0;
    });
    return map;
  }, [services]);

  const dateRange = getDateRangeForAPI();

  // allow Day Off (client_id null) to pass client filter
  const filteredCompletedAppointments = useMemo(() => {
    if (!dateRange) return [];

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999);

    return appointments.filter((apt) => {
      const appointmentDate = new Date(apt.start_time);
      const dateMatch = appointmentDate >= startDate && appointmentDate <= endDate;

      const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);

      const clientMatch = !apt.client_id || selectedClients.length === 0 || selectedClients.includes(apt.client_id);

      const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);

      const statusMatch = apt.status === "completed";

      return dateMatch && masterMatch && clientMatch && serviceMatch && statusMatch;
    });
  }, [appointments, dateRange, selectedMasters, selectedClients, selectedServices]);

  const metrics = useMemo(() => {
    const totalRevenue = filteredCompletedAppointments.reduce((sum, apt) => sum + (serviceMap[apt.service_id] || 0), 0);
    const totalAppointments = filteredCompletedAppointments.length;
    const avgCheck = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

    const masterRevenue = {};
    filteredCompletedAppointments.forEach((apt) => {
      const masterId = apt.master_id;
      const masterName = apt.master_name || "Unknown";
      const price = serviceMap[apt.service_id] || 0;

      if (!masterRevenue[masterId]) masterRevenue[masterId] = { name: masterName, revenue: 0 };
      masterRevenue[masterId].revenue += price;
    });

    const topMaster =
      Object.values(masterRevenue).sort((a, b) => b.revenue - a.revenue)[0] || { name: "N/A", revenue: 0 };

    return {
      totalRevenue,
      totalAppointments,
      avgCheck,
      topMaster,
    };
  }, [filteredCompletedAppointments, serviceMap]);

 
const topClient = useMemo(() => {
  if (!isMaster) return null; // Только для мастера

  const clientCounts = {};
  filteredCompletedAppointments.forEach((apt) => {
    if (apt.client_id) {
      clientCounts[apt.client_id] = (clientCounts[apt.client_id] || 0) + 1;
    }
  });

  let top = { id: null, count: 0 };
  Object.entries(clientCounts).forEach(([id, count]) => {
    if (count > top.count) top = { id, count };
  });

  const clientObj = clients.find((c) => c.id === top.id);
  return clientObj
    ? { name: clientObj.name, count: top.count }
    : { name: "N/A", count: 0 };
}, [filteredCompletedAppointments, clients, isMaster]);

  // ======= LINE CHART + FORECAST =======
  // Build daily buckets for actuals in selected period
  const revenueSeries = useMemo(() => {
    if (!dateRange) return [];

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    const keyFor = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const labelFor = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const buckets = [];
    const map = new Map();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = keyFor(d);
      const item = { key: k, label: labelFor(d), value: 0, isForecast: false };
      buckets.push(item);
      map.set(k, item);
    }

    filteredCompletedAppointments.forEach((apt) => {
      const d = new Date(apt.start_time);
      const k = keyFor(d);
      const price = serviceMap[apt.service_id] || 0;
      if (map.has(k)) map.get(k).value += price;
    });

    return buckets;
  }, [dateRange, filteredCompletedAppointments, serviceMap]);

  // Forecast: extend line for N days based on last 7-day moving average
  const forecastDays = useMemo(() => {
    if (period === "day") return 7;
    if (period === "week") return 7;
    return 10; // month
  }, [period]);

  const revenueWithForecast = useMemo(() => {
    if (revenueSeries.length === 0) return [];

    const actual = revenueSeries;
    const last = actual[actual.length - 1];
    const avgWindow = 7;

    const avg =
      actual.slice(Math.max(0, actual.length - avgWindow)).reduce((s, p) => s + p.value, 0) /
      Math.min(avgWindow, actual.length);

    const startDate = new Date(last.key);
    const out = [...actual];

    for (let i = 1; i <= forecastDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      // simple gentle trend: approach avg + small drift using last delta
      const prev = out[out.length - 1];
      const delta = prev && !prev.isForecast && out.length >= 2 ? prev.value - out[out.length - 2].value : 0;
      const drift = clamp(delta * 0.25, -avg * 0.15, avg * 0.15);

      out.push({
        key,
        label,
        value: Math.max(0, avg + drift),
        isForecast: true,
      });
    }

    return out;
  }, [revenueSeries, forecastDays, period]);

  const maxY = useMemo(() => Math.max(1, ...revenueWithForecast.map((p) => p.value)), [revenueWithForecast]);

  const chart = useMemo(() => {
    const points = revenueWithForecast;
    if (points.length === 0) return null;

    const w = 920;
    const h = 240;
    const pad = 20;

    const xFor = (i) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
    const yFor = (v) => pad + (h - pad * 2) * (1 - v / maxY);

    const actualPoints = points.filter((p) => !p.isForecast);
    const forecastPoints = points.filter((p) => p.isForecast);

    const pathFor = (arr, offsetIndex = 0) => {
      return arr
        .map((p, idx) => {
          const i = offsetIndex + idx;
          const x = xFor(i);
          const y = yFor(p.value);
          return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
        })
        .join(" ");
    };

    const actualPath = pathFor(actualPoints, 0);
    const forecastPath = forecastPoints.length > 0 ? pathFor(forecastPoints, actualPoints.length - 1) : "";

    const areaPath =
      actualPoints.length > 0
        ? `${actualPath} L ${xFor(actualPoints.length - 1)} ${h - pad} L ${xFor(0)} ${h - pad} Z`
        : "";

    return {
      w,
      h,
      pad,
      points,
      actualPoints,
      forecastPoints,
      xFor,
      yFor,
      actualPath,
      forecastPath,
      areaPath,
    };
  }, [revenueWithForecast, maxY]);

  // Selected point (tooltip)
  const hoveredPoint = useMemo(() => {
    if (hoverIdx == null || !chart) return null;
    const p = chart.points[hoverIdx];
    if (!p) return null;
    return p;
  }, [hoverIdx, chart]);

  const maxRevenue = Math.max(1, ...revenueSeries.map((p) => p.value));

  const masterId = useMemo(() => isMaster && masters.length > 0 ? masters[0].id : null, [isMaster, masters]);
  const upcomingAppointments = useMemo(() => {
     const now = new Date();
    if (isMaster && !masterId) return []; 
console.log(appointments, masters)
  return appointments
    .filter((apt) => {
      const start = new Date(apt.start_time);
      const isFuture = start >= now;
  
      const masterMatch =
        isMaster
          ? apt.master_id === masters[0]?.id // Только индекс [0] для мастера
          : selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);

      const clientMatch = !apt.client_id || selectedClients.length === 0 || selectedClients.includes(apt.client_id);
      const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);

      return isFuture && masterMatch && clientMatch && serviceMatch;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 8);
}, [appointments, selectedMasters, selectedClients, selectedServices, isMaster, masters]);

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMasterName = (id) => masters.find((m) => m.id === id)?.name || "Unknown";
  const getClientName = (id) => {
    if (!id) return "—";
    return clients.find((c) => c.id === id)?.name || "Unknown";
  };
  const getServiceName = (id) => services.find((s) => s.id === id)?.name || "Unknown";

  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <div className="dashboard-topbar">
        <div className="topbar-left">
          <div className="calendar-nav">
            <button className="nav-btn" onClick={handlePrevious}>
              ‹
            </button>
            <button className="nav-btn today-btn" onClick={handleToday}>
              Today
            </button>
            <button className="nav-btn" onClick={handleNext}>
              ›
            </button>
            <span className="date-range">{getDateRangeText()}</span>
          </div>
        </div>

        <div className="topbar-center">
          <div className="period-selector">
            <button className={period === "day" ? "active" : ""} onClick={() => handlePeriodChange("day")}>
              Day
            </button>
            <button className={period === "week" ? "active" : ""} onClick={() => handlePeriodChange("week")}>
              Week
            </button>
            <button className={period === "month" ? "active" : ""} onClick={() => handlePeriodChange("month")}>
              Month
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <div className="filters-group">
            {isAdmin && (
              <div className="filter-item">
                <button
                  className="filter-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMasterFilter(!showMasterFilter);
                  }}
                >
                  Masters ({selectedMasters.length}/{masters.length})
                </button>
                {showMasterFilter && (
                  <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedMasters.length === masters.length && masters.length > 0}
                        onChange={toggleAllMasters}
                      />
                      <span>All Masters</span>
                    </label>
                    {masters.map((master) => (
                      <label key={master.id} className="filter-option">
                        <input type="checkbox" checked={selectedMasters.includes(master.id)} onChange={() => toggleMaster(master.id)} />
                        <span>{master.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="filter-item">
              <button
                className="filter-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowClientFilter(!showClientFilter);
                }}
              >
                Clients ({selectedClients.length}/{clients.length})
              </button>
              {showClientFilter && (
                <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedClients.length === clients.length && clients.length > 0}
                      onChange={toggleAllClients}
                    />
                    <span>All Clients</span>
                  </label>
                  {clients.map((client) => (
                    <label key={client.id} className="filter-option">
                      <input type="checkbox" checked={selectedClients.includes(client.id)} onChange={() => toggleClient(client.id)} />
                      <span>{client.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="filter-item">
              <button
                className="filter-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowServiceFilter(!showServiceFilter);
                }}
              >
                Services ({selectedServices.length}/{services.length})
              </button>
              {showServiceFilter && (
                <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedServices.length === services.length && services.length > 0}
                      onChange={toggleAllServices}
                    />
                    <span>All Services</span>
                  </label>
                  {services.map((service) => (
                    <label key={service.id} className="filter-option">
                      <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} />
                      <span>{service.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {isMaster && (
              <div className="muted" style={{ marginLeft: 12 }}>
                {userEmail || userId}
              </div>
            )}
          </div>
        </div>

        {error && <p className="error-message">{error}</p>}
      </div>

      {/* KPI Widgets */}
      <div className="kpi-grid">
        <StatsWidget title="Revenue" value={formatCurrencyShort(metrics.totalRevenue)} subtitle="In selected period" trend="" icon={revenueIcon} />
        <StatsWidget title="Appointments" value={metrics.totalAppointments || 0} subtitle="Completed" trend="" icon={appointmentsIcon} />
        <StatsWidget title="Average Check" value={formatCurrencyShort(metrics.avgCheck)} subtitle="Per appointment" icon={avgCheckIcon} />
        {isMaster
    ? <StatsWidget title="Top Client" value={topClient?.name || "N/A"} subtitle={`${topClient?.count || 0} visits`} icon={topMasterIcon} />
    : <StatsWidget title="Top Master" value={metrics.topMaster?.name || "N/A"} subtitle={`${formatCurrencyShort(metrics.topMaster?.revenue || 0)} revenue`} icon={topMasterIcon} />
  }
   </div>

      <div className="dashboard-sections">
        {/* Revenue line chart with forecast (SVG, no libs) */}
        <section className="card dashboard-section revenue-section">
          <div className="dashboard-section-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ marginBottom: 6 }}>Revenue</h3>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em" }}>
                {formatCurrencyShort(metrics.totalRevenue)}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                in selected period • {getDateRangeText()}
              </div>
            </div>

            <div className="muted" style={{ fontWeight: 800 }}>
              {period === "day" ? "Days" : period === "week" ? "Days" : "Days"}
            </div>
          </div>

          {!chart ? (
            <div className="muted" style={{ padding: 16 }}>
              No data
            </div>
          ) : (
            <div className="revenue-chart-wrapper" style={{ position: "relative", marginTop: 18 }}>
              {/* Tooltip */}
              {hoveredPoint && hoverIdx != null && (
                <div
                  style={{
                    position: "absolute",
                    left: `${(chart.xFor(hoverIdx) / chart.w) * 100}%`,
                    top: 0,
                    transform: "translate(-50%, -10px)",
                    background: "#e8f1ff",
                    border: "1px solid #c7dbff",
                    color: "#0b2559",
                    padding: "10px 12px",
                    borderRadius: 10,
                    minWidth: 150,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {formatCurrencyShort(hoveredPoint.value)}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {hoveredPoint.label}
                    {hoveredPoint.isForecast ? " • forecast" : ""}
                  </div>
                </div>
              )}

              <svg
                viewBox={`0 0 ${chart.w} ${chart.h}`}
                width="100%"
                style={{ display: "block", minWidth: 480 }}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {/* grid lines */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = chart.pad + ((chart.h - chart.pad * 2) * i) / 4;
                  return <line key={i} x1={chart.pad} x2={chart.w - chart.pad} y1={y} y2={y} stroke="#eef2f7" strokeWidth="1" />;
                })}

                {/* area under actual */}
                <path d={chart.areaPath} fill="rgba(59,130,246,0.10)" stroke="none" />

                {/* actual line */}
                <path d={chart.actualPath} fill="none" stroke="#3b82f6" strokeWidth="3" />

                {/* forecast line (dashed) */}
                {chart.forecastPoints.length > 0 && (
                  <path
                    d={chart.forecastPath}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray="6 6"
                    opacity="0.9"
                  />
                )}

                {/* hover targets */}
                {chart.points.map((p, i) => {
                  const x = chart.xFor(i);
                  const y = chart.yFor(p.value);

                  return (
                    <g key={p.key}>
                      {/* invisible hit area */}
                      <circle
                        cx={x}
                        cy={y}
                        r="10"
                        fill="transparent"
                        onMouseEnter={() => setHoverIdx(i)}
                      />
                      {/* visible dot only for hovered */}
                      {hoverIdx === i && (
                        <>
                          <circle cx={x} cy={y} r="6" fill="#3b82f6" />
                          <circle cx={x} cy={y} r="10" fill="rgba(59,130,246,0.15)" />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* x-axis labels: show ~6 labels */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, color: "#6b7280", fontWeight: 700, fontSize: 12 }}>
                {(() => {
                  const pts = revenueWithForecast;
                  const count = pts.length;
                  const steps = 5;
                  const out = [];
                  for (let i = 0; i <= steps; i++) {
                    const idx = Math.round((i * (count - 1)) / steps);
                    out.push(
                      <span key={i} style={{ width: `${100 / (steps + 1)}%`, textAlign: i === 0 ? "left" : i === steps ? "right" : "center" }}>
                        {pts[idx]?.label || ""}
                      </span>
                    );
                  }
                  return out;
                })()}
              </div>

              <div className="muted" style={{ marginTop: 8, fontWeight: 700 }}>
                Solid line = actual • Dashed line = forecast
              </div>
            </div>
          )}
        </section>

        {/* Upcoming appointments */}
        <section className="card dashboard-section">
          <div className="dashboard-section-header dashboard-upcoming-header">
            <div className="dashboard-upcoming-title">
              <h3>Upcoming Appointments</h3>
              <span className="muted">{loading ? "Loading..." : `${upcomingAppointments.length} shown`}</span>
            </div>

            <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
              + New Appointment
            </button>
          </div>

          <div className="upcoming-list">
            {upcomingAppointments.length > 0 ? (
              upcomingAppointments.map((a) => (
                <div className="upcoming-item" key={a.id}>
                  <div className="upcoming-item-left">
                    <div className="upcoming-datetime">{formatDateTime(a.start_time)}</div>
                    <div className="upcoming-title">
                      {getClientName(a.client_id)} • {getServiceName(a.service_id)}
                    </div>
                    <div className="upcoming-subtitle muted">{getMasterName(a.master_id)}</div>
                  </div>
                  <div className="upcoming-item-right">
                    <span className="upcoming-status">planned</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">No upcoming appointments for current filters.</div>
            )}
          </div>
        </section>
      </div>

      {showCreateModal && (
        <CreateAppointmentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}