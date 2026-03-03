import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAppointmentsByDateRange,
  fetchMasters,
  fetchClients,
  fetchServices,
} from "../api/api";

import StatsWidget from "./components/StatsWidget";
import CreateAppointmentModal from "./components/CreateAppointmentModal";

import revenueIcon from "../assets/icons/revenue.svg";
import appointmentsIcon from "../assets/icons/app-icon.svg";
import avgCheckIcon from "../assets/icons/avg-check.svg";
import topMasterIcon from "../assets/icons/top-master.svg";

import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const redirectedRef = useRef(false);

  const [appointments, setAppointments] = useState([]);
  const [period, setPeriod] = useState("week");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const token = localStorage.getItem("token");

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

  // Redirect if no token
  useEffect(() => {
    if (!token && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate("/login", { replace: true });
    } else if (token) {
      loadFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load data when filters / date changes
  useEffect(() => {
    if (token) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, currentDate, selectedMasters, selectedClients, selectedServices, token]);

  // Close filter dropdowns on outside click
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
      const mastersData = await fetchMasters(token);
      const clientsData = await fetchClients(token);
      const servicesData = await fetchServices(token);

      setMasters(mastersData);
      setClients(clientsData);
      setServices(servicesData);

      setSelectedMasters(mastersData.map((m) => m.id));
      setSelectedClients(clientsData.map((c) => c.id));
      setSelectedServices(servicesData.map((s) => s.id));
    } catch (err) {
      console.error("Failed to load filters:", err);
      setError(err.message || "Failed to load filters");
    }
  };

  // Date range for API
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

  // Filter toggles
  const toggleMaster = (masterId) => {
    setSelectedMasters((prev) =>
      prev.includes(masterId) ? prev.filter((id) => id !== masterId) : [...prev, masterId]
    );
  };
  const toggleClient = (clientId) => {
    setSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };
  const toggleService = (serviceId) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const toggleAllMasters = () => {
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

  // ---- Metrics + revenue series derived from appointments + services ----
  const serviceMap = useMemo(() => {
    const map = {};
    services.forEach((s) => {
      map[s.id] = Number(s.price) || 0;
    });
    return map;
  }, [services]);

  const dateRange = getDateRangeForAPI();

  const filteredCompletedAppointments = useMemo(() => {
    if (!dateRange) return [];

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999);

    return appointments.filter((apt) => {
      const appointmentDate = new Date(apt.start_time);
      const dateMatch = appointmentDate >= startDate && appointmentDate <= endDate;

      const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);
      const clientMatch = selectedClients.length === 0 || selectedClients.includes(apt.client_id);
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

  // Revenue chart buckets (simple, no extra libs)
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

    // create buckets for each day in range
    const buckets = [];
    const map = new Map();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = keyFor(d);
      const item = { key: k, label: labelFor(d), value: 0 };
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

  // Upcoming appointments (planned, future, filtered)
  const upcomingAppointments = useMemo(() => {
    const now = new Date();

    const upcoming = appointments
      .filter((apt) => {
        const start = new Date(apt.start_time);
        const isFuture = start >= now;
        const statusMatch = apt.status === "planned";

        const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);
        const clientMatch = selectedClients.length === 0 || selectedClients.includes(apt.client_id);
        const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);

        return isFuture && statusMatch && masterMatch && clientMatch && serviceMatch;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .slice(0, 8);

    return upcoming;
  }, [appointments, selectedMasters, selectedClients, selectedServices]);

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
  const getClientName = (id) => clients.find((c) => c.id === id)?.name || "Unknown";
  const getServiceName = (id) => services.find((s) => s.id === id)?.name || "Unknown";

  const maxRevenue = Math.max(1, ...revenueSeries.map((p) => p.value));

  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <div className="dashboard-topbar">
        <div className="topbar-left">
          <div className="calendar-nav">
            <button className="nav-btn" onClick={handlePrevious}>‹</button>
            <button className="nav-btn today-btn" onClick={handleToday}>Today</button>
            <button className="nav-btn" onClick={handleNext}>›</button>
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
                      <input
                        type="checkbox"
                        checked={selectedMasters.includes(master.id)}
                        onChange={() => toggleMaster(master.id)}
                      />
                      <span>{master.name}</span>
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
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client.id)}
                        onChange={() => toggleClient(client.id)}
                      />
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
                      <input
                        type="checkbox"
                        checked={selectedServices.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                      />
                      <span>{service.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {/* KPI Widgets */}
      <div className="kpi-grid">
        <StatsWidget
          title="Revenue"
          value={`$${(metrics.totalRevenue || 0).toFixed(0)}`}
          subtitle="All confirmed & completed"
          trend=""
          icon={revenueIcon}
        />
        <StatsWidget
          title="Appointments"
          value={metrics.totalAppointments || 0}
          subtitle="Completed"
          trend=""
          icon={appointmentsIcon}
        />
        <StatsWidget
          title="Average Check"
          value={`$${(metrics.avgCheck || 0).toFixed(0)}`}
          subtitle="Per appointment"
          icon={avgCheckIcon}
        />
        <StatsWidget
          title="Top Master"
          value={metrics.topMaster?.name || "N/A"}
          subtitle={`$${(metrics.topMaster?.revenue || 0).toFixed(0)} revenue`}
          icon={topMasterIcon}
        />
      </div>

      {/* Sections */}
      <div className="dashboard-sections">
        {/* 1) Revenue chart (with background on the whole card) */}
        <section className="card dashboard-section revenue-section">
          <div className="dashboard-section-header">
            <h3>Revenue</h3>
            <span className="muted">{getDateRangeText()}</span>
          </div>

          <div className="revenue-chart" role="img" aria-label="Revenue chart">
            {revenueSeries.map((p) => {
              const h = Math.round((p.value / maxRevenue) * 100);
              return (
                <div className="revenue-bar" key={p.key} title={`${p.label}: $${p.value.toFixed(0)}`}>
                  <div className="revenue-bar-fill" style={{ height: `${h}%` }} />
                  <div className="revenue-bar-label">{p.label}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 2) Upcoming appointments */}
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

      {/* Create Appointment Modal */}
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