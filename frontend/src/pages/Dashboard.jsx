import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboardStats,
  getAppointmentsByDateRange,
  fetchMasters,
  fetchClients,
  fetchServices,
} from "../api/api";
import Calendar from "./components/Calendar";
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
  
  const [stats, setStats] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [period, setPeriod] = useState("week");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const token = localStorage.getItem("token");

  // Фильтры
  const [masters, setMasters] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedMasters, setSelectedMasters] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);

  // Видимость фильтров
  const [showMasterFilter, setShowMasterFilter] = useState(false);
  const [showClientFilter, setShowClientFilter] = useState(false);
  const [showServiceFilter, setShowServiceFilter] = useState(false);

  // Дата для навигации
  const [currentDate, setCurrentDate] = useState(new Date());

  // Проверка токена и редирект на логин
  useEffect(() => {
    if (!token && !redirectedRef.current) {
      redirectedRef.current = true;
      navigate("/login", { replace: true });
    } else if (token) {
      loadFilters();
    }
  }, [token]);

  // Загрузка данных при смене периода/даты/фильтров
  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [period, currentDate, selectedMasters, selectedClients, selectedServices, token]);

  // Закрытие фильтров при клике в пустое место
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

      setSelectedMasters(mastersData.map(m => m.id));
      setSelectedClients(clientsData.map(c => c.id));
      setSelectedServices(servicesData.map(s => s.id));
    } catch (err) {
      console.error("Failed to load filters:", err);
      setError(err.message || "Failed to load filters");
    }
  };

  const loadData = async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const dateRange = getDateRangeForAPI();

      // Загружаем все записи за период
      const appointmentsData = await getAppointmentsByDateRange(
        token,
        dateRange.start,
        dateRange.end
      );
      
      console.log("Raw appointments from API:", appointmentsData);
      console.log("Appointments count:", appointmentsData?.length);
      
      setAppointments(appointmentsData);
      setError("");
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  // Функция для получения диапазона дат для API
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
    if (period === "day") {
      newDate.setDate(newDate.getDate() - 1);
    } else if (period === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else if (period === "month") {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (period === "day") {
      newDate.setDate(newDate.getDate() + 1);
    } else if (period === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else if (period === "month") {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    setCurrentDate(new Date());
  };

  const toggleMaster = (masterId) => {
    setSelectedMasters(prev =>
      prev.includes(masterId)
        ? prev.filter(id => id !== masterId)
        : [...prev, masterId]
    );
  };

  const toggleClient = (clientId) => {
    setSelectedClients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const toggleService = (serviceId) => {
    setSelectedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const toggleAllMasters = () => {
    if (selectedMasters.length === masters.length) {
      setSelectedMasters([]);
    } else {
      setSelectedMasters(masters.map(m => m.id));
    }
  };

  const toggleAllClients = () => {
    if (selectedClients.length === clients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(clients.map(c => c.id));
    }
  };

  const toggleAllServices = () => {
    if (selectedServices.length === services.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices(services.map(s => s.id));
    }
  };

// Расчёт метрик из реальных данных с учётом фильтров И дат
const calculateMetrics = () => {
  // Если сервисы не загружены - возвращаем нули
  if (!services || services.length === 0) {
    return {
      totalRevenue: 0,
      totalAppointments: 0,
      avgCheck: 0,
      topMaster: { name: "N/A", revenue: 0 },
    };
  }

  const dateRange = getDateRangeForAPI();
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  endDate.setHours(23, 59, 59, 999); // Конец дня

  // Создаём map сервисов для быстрого поиска цены
  // ВАЖНО: преобразуем цену в число, т.к. она приходит строкой
  const serviceMap = {};
  services.forEach(service => {
    serviceMap[service.id] = Number(service.price) || 0;
  });

  const filteredAppointments = appointments.filter(apt => {
    // Фильтр по датам - используем start_time
    const appointmentDate = new Date(apt.start_time);
    const dateMatch = appointmentDate >= startDate && appointmentDate <= endDate;

    console.log("Appointment:", {
    id: apt.id,
    start_time: apt.start_time,
    appointmentDate: appointmentDate.toISOString(),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    dateMatch,
  });
  
    // Проверяем фильтры - если выбраны - фильтруем, если нет - берём все
    const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);
    const clientMatch = selectedClients.length === 0 || selectedClients.includes(apt.client_id);
    const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);
    const statusMatch = apt.status === "completed";
    
    return dateMatch && masterMatch && clientMatch && serviceMatch && statusMatch;
  });

  console.log("Date range:", dateRange);
  console.log("Filtered appointments:", filteredAppointments);
  console.log("Service map:", serviceMap);

  // Расчёт общего дохода (берём цену из serviceMap)
  const totalRevenue = filteredAppointments.reduce((sum, apt) => {
    const price = serviceMap[apt.service_id] || 0;
    return sum + price;
  }, 0);

  // Количество записей
  const totalAppointments = filteredAppointments.length;

  // Средний чек
  const avgCheck = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

  // Топ мастер (по доходу)
  const masterRevenue = {};
  filteredAppointments.forEach(apt => {
    const masterId = apt.master_id;
    const masterName = apt.master_name || "Unknown";
    const price = serviceMap[apt.service_id] || 0;
    
    if (!masterRevenue[masterId]) {
      masterRevenue[masterId] = { name: masterName, revenue: 0 };
    }
    masterRevenue[masterId].revenue += price;
  });

  const topMaster = Object.values(masterRevenue).sort((a, b) => b.revenue - a.revenue)[0] || {
    name: "N/A",
    revenue: 0,
  };

  return {
    totalRevenue: Number(totalRevenue) || 0,
    totalAppointments: Number(totalAppointments) || 0,
    avgCheck: Number(avgCheck) || 0,
    topMaster: {
      name: topMaster.name,
      revenue: Number(topMaster.revenue) || 0, // Преобразуем в число
    },
  };
};

const dateRange = getDateRangeForAPI();
const metrics = calculateMetrics();

  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <div className="dashboard-topbar">
        <div className="topbar-left">
          <div className="calendar-nav">
            <button className="nav-btn" onClick={handlePrevious}>‹</button>
            <button className="nav-btn today-btn" onClick={handleToday}>Today</button>
            <button className="nav-btn" onClick={handleNext}>›</button>
            <span className="date-range">
              {getDateRangeText()}
            </span>
          </div>
        </div>

        <div className="topbar-center">
          <div className="period-selector">
            <button
              className={period === "day" ? "active" : ""}
              onClick={() => handlePeriodChange("day")}
            >
              Day
            </button>
            <button
              className={period === "week" ? "active" : ""}
              onClick={() => handlePeriodChange("week")}
            >
              Week
            </button>
            <button
              className={period === "month" ? "active" : ""}
              onClick={() => handlePeriodChange("month")}
            >
              Month
            </button>
          </div>
        </div>

        <div className="topbar-right">
          {/* Фильтры */}
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
                  {masters.map(master => (
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
                  {clients.map(client => (
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
                  {services.map(service => (
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

          <button
            className="add-appointment-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + New Appointment
          </button>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

{/* KPI Widgets */}
{metrics && metrics.totalRevenue !== undefined ? (
  <div className="kpi-grid">
    <StatsWidget
      title="Revenue This Week"
      value={`$${metrics.totalRevenue.toFixed(0)}`}
      subtitle="All confirmed & completed"
      trend="+12%"
      icon={revenueIcon}
    />
    <StatsWidget
      title="Appointments"
      value={metrics.totalAppointments}
      subtitle="This week total"
      trend="+5%"
      icon={appointmentsIcon}
    />
    <StatsWidget
      title="Average Check"
      value={`$${metrics.avgCheck.toFixed(0)}`}
      subtitle="Per appointment"
      icon={avgCheckIcon}
    />
    <StatsWidget
      title="Top Master"
      value={metrics.topMaster.name}
      subtitle={`$${metrics.topMaster.revenue.toFixed(0)} revenue`}
      icon={topMasterIcon}
    />
  </div>
) : (
  <div className="kpi-grid">
    <p>Loading metrics...</p>
  </div>
)}

      {/* Calendar */}
      <div className="calendar-main-section">
        <Calendar 
          onRefresh={loadData}
          selectedMasters={selectedMasters}
          selectedClients={selectedClients}
          selectedServices={selectedServices}
          dateRange={dateRange}
          period={period}
          currentDate={currentDate}
        />
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