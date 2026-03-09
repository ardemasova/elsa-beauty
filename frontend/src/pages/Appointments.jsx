import { useEffect, useMemo, useRef, useState } from "react";
import Calendar from "./components/Calendar";
import {
  fetchMasters,
  fetchMyMaster,
  fetchClients,
  fetchServices,
  getAppointmentsByDateRange,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from "../api/api";

import CreateAppointmentModal from "./components/CreateAppointmentModal";

import * as XLSX from "xlsx";

import "./Dashboard.css";
import "./Appointments.css";

function decodeToken(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

export default function Appointments() {
  const token = localStorage.getItem("token");
  const tokenPayload = useMemo(() => decodeToken(token), [token]);
  const isAdmin = tokenPayload?.role === "admin";
  const isMaster = tokenPayload?.role === "master";

  const [myMasterId, setMyMasterId] = useState("");

  // ======= Верхняя панель: период/дата =======
  const [period, setPeriod] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  // ======= Фильтры =======
  const [masters, setMasters] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);

  const [selectedMasters, setSelectedMasters] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);

  const [showMasterFilter, setShowMasterFilter] = useState(false);
  const [showClientFilter, setShowClientFilter] = useState(false);
  const [showServiceFilter, setShowServiceFilter] = useState(false);

  // ======= Данные =======
  const [appointments, setAppointments] = useState([]);

  // ======= Модалка создания =======
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Состояние для редактирования
  const [editingId, setEditingId] = useState(null);
  const [editMasterId, setEditMasterId] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editServiceId, setEditServiceId] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editStatus, setEditStatus] = useState("planned");

  // Состояние для подтверждения удаления
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Чтобы не закрывать фильтры кликом внутри области фильтров
  const filtersWrapperRef = useRef(null);

  const canEditAppointment = (appointment) => {
    if (isAdmin) return true;
    if (isMaster) return Boolean(myMasterId) && appointment?.master_id === myMasterId;
    return false;
  };

  // ======= Даты: диапазон для API (как в Dashboard) =======
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

    // fallback
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

  // ======= Фильтры =======
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

  // Закрытие фильтров при клике вне
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filtersWrapperRef.current && filtersWrapperRef.current.contains(e.target)) return;
      setShowMasterFilter(false);
      setShowClientFilter(false);
      setShowServiceFilter(false);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // ======= Загрузка справочников =======
  const loadFilters = async () => {
    try {
      setError("");

      const [clientsData, servicesData, mastersData, me] = await Promise.all([
        fetchClients(token),
        fetchServices(token),
        fetchMasters(token), // (после правки backend/masters.js мастер сможет это вызвать)
        isMaster ? fetchMyMaster(token) : Promise.resolve(null),
      ]);

      setClients(clientsData);
      setServices(servicesData);
      setSelectedClients(clientsData.map((c) => c.id));
      setSelectedServices(servicesData.map((s) => s.id));

      setMasters(Array.isArray(mastersData) ? mastersData : []);
      setSelectedMasters(Array.isArray(mastersData) ? mastersData.map((m) => m.id) : []);

      setMyMasterId(me?.id || "");
    } catch (err) {
      console.error("Failed to load filters:", err);
      setError(err.message || "Failed to load filters");
    }
  };

  // ======= Загрузка appointments за период =======
  const loadAppointmentsByRange = async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const range = getDateRangeForAPI();
      const data = await getAppointmentsByDateRange(token, range.start, range.end);
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load appointments:", err);
      setError(err.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  };

  // Инициализация
  useEffect(() => {
    if (token) loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, isMaster]);

  // Перезагрузка при смене периода/даты
  useEffect(() => {
    if (!token) return;
    loadAppointmentsByRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period, currentDate]);

  // ======= Данные для таблицы с применением фильтров =======
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);
      const clientMatch = selectedClients.length === 0 || selectedClients.includes(apt.client_id);
      const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);
      return masterMatch && clientMatch && serviceMatch;
    });
  }, [appointments, selectedMasters, selectedClients, selectedServices]);

  // ======= Хелперы отображения =======
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
  const getServiceDuration = (id) => services.find((s) => s.id === id)?.duration || 0;

  const getStatusColor = (status) => {
    switch (status) {
      case "planned":
        return { bg: "#dbeafe", color: "#1e40af" };
      case "completed":
        return { bg: "#dcfce7", color: "#166534" };
      case "cancelled":
        return { bg: "#fee2e2", color: "#991b1b" };
      default:
        return { bg: "#f3f4f6", color: "#4b5563" };
    }
  };

  // ======= Edit/Delete =======
  const handleEditClick = (appointment) => {
    if (!canEditAppointment(appointment)) return;

    setEditingId(appointment.id);
    setEditMasterId(appointment.master_id);
    setEditClientId(appointment.client_id);
    setEditServiceId(appointment.service_id);
    setEditStartTime(appointment.start_time.slice(0, 16));
    setEditStatus(appointment.status);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;

    // master может сохранять только свои
    const apt = appointments.find((a) => a.id === editingId);
    if (!canEditAppointment(apt)) return;

    setError("");
    setLoading(true);

    try {
      await updateAppointment(token, editingId, {
        master_id: editMasterId,
        client_id: editClientId,
        service_id: editServiceId,
        start_time: editStartTime,
        status: editStatus,
      });

      setEditingId(null);
      setEditMasterId("");
      setEditClientId("");
      setEditServiceId("");
      setEditStartTime("");
      setEditStatus("planned");

      await loadAppointmentsByRange();
    } catch (err) {
      setError(err.message || "Failed to update appointment");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditMasterId("");
    setEditClientId("");
    setEditServiceId("");
    setEditStartTime("");
    setEditStatus("planned");
  };

  const handleDeleteClick = (appointment) => {
    if (!canEditAppointment(appointment)) return;
    setDeleteConfirmId(appointment.id);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;

    const apt = appointments.find((a) => a.id === deleteConfirmId);
    if (!canEditAppointment(apt)) return;

    setError("");
    setLoading(true);

    try {
      await deleteAppointment(token, deleteConfirmId);
      setDeleteConfirmId(null);
      await loadAppointmentsByRange();
    } catch (err) {
      setError(err.message || "Failed to delete appointment");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDelete = () => setDeleteConfirmId(null);

  // ======= Excel export (только текущие отфильтрованные) =======
  const handleExportExcel = () => {
    const rows = filteredAppointments.map((a) => ({
      ID: a.id,
      Master: getMasterName(a.master_id),
      Client: getClientName(a.client_id),
      Service: getServiceName(a.service_id),
      "Start Time": formatDateTime(a.start_time),
      Duration: `${getServiceDuration(a.service_id)} min`,
      Status: a.status,
    }));

    const range = getDateRangeForAPI();
    const fileName = `appointments_${range.start}_${range.end}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Appointments");
    XLSX.writeFile(wb, fileName);
  };

  const dateRange = getDateRangeForAPI();

  return (
    <div className="dashboard-container">
      {/* Верхняя панель */}
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

        <div className="topbar-right" ref={filtersWrapperRef}>
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
                  {masters.map((m) => (
                    <label key={m.id} className="filter-option">
                      <input type="checkbox" checked={selectedMasters.includes(m.id)} onChange={() => toggleMaster(m.id)} />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Clients filter */}
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
                  {clients.map((c) => (
                    <label key={c.id} className="filter-option">
                      <input type="checkbox" checked={selectedClients.includes(c.id)} onChange={() => toggleClient(c.id)} />
                      <span>{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Services filter */}
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
                  {services.map((s) => (
                    <label key={s.id} className="filter-option">
                      <input type="checkbox" checked={selectedServices.includes(s.id)} onChange={() => toggleService(s.id)} />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ошибка верхняя */}
      {error && <p className="appointments-error-message">{error}</p>}

      {/* Календарь */}
      <div className="calendar-main-section">
        <Calendar
          onRefresh={loadAppointmentsByRange}
          masters={masters}
          selectedMasters={selectedMasters}
          selectedClients={selectedClients}
          selectedServices={selectedServices}
          dateRange={dateRange}
          period={period}
          currentDate={currentDate}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Таблица + экспорт */}
      <div className="container">
        <div className="appointments-header-row">
          <h2>Appointments</h2>

          {/* Создание: admin всегда, master только для себя (разрешено backend) */}
          <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
            + New Appointment
          </button>

          <button
            className="export-btn"
            type="button"
            onClick={handleExportExcel}
            disabled={loading}
            title="Exports only currently filtered appointments"
          >
            Export to Excel
          </button>
        </div>

        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Master</th>
                <th>Client</th>
                <th>Service</th>
                <th>Start Time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredAppointments.length > 0 ? (
                filteredAppointments.map((a) => {
                  const editable = canEditAppointment(a);

                  return (
                    <tr key={a.id}>
                      <td>{getMasterName(a.master_id)}</td>
                      <td>{getClientName(a.client_id)}</td>
                      <td>{getServiceName(a.service_id)}</td>
                      <td>{formatDateTime(a.start_time)}</td>
                      <td>{getServiceDuration(a.service_id)} min</td>
                      <td>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "500",
                            backgroundColor: getStatusColor(a.status).bg,
                            color: getStatusColor(a.status).color,
                          }}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="actions">
                        {editable ? (
                          <>
                            <button type="button" className="secondary" onClick={() => handleEditClick(a)} disabled={loading}>
                              Edit
                            </button>
                            <button type="button" className="danger" onClick={() => handleDeleteClick(a)} disabled={loading}>
                              Delete
                            </button>
                          </>
                        ) : (
                          <span style={{ color: "#9ca3af", fontWeight: 700 }}>View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", color: "#9ca3af" }}>
                    No appointments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Модальное окно редактирования */}
        {editingId && (
          <div className="modal-overlay" onClick={handleCancelEdit}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Edit Appointment</h3>
              <form onSubmit={handleSaveEdit}>
                <select value={editMasterId} onChange={(e) => setEditMasterId(e.target.value)} required disabled={loading || (isMaster && editMasterId !== myMasterId)}>
                  <option value="">Select Master</option>
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>

                <select value={editClientId} onChange={(e) => setEditClientId(e.target.value)} required disabled={loading}>
                  <option value="">Select Client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select value={editServiceId} onChange={(e) => setEditServiceId(e.target.value)} required disabled={loading}>
                  <option value="">Select Service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration} min)
                    </option>
                  ))}
                </select>

                <input
                  type="datetime-local"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  required
                  disabled={loading}
                />

                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={loading}>
                  <option value="planned">Planned</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <div className="modal-actions">
                  <button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className="secondary" onClick={handleCancelEdit} disabled={loading}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Модальное окно подтверждения удаления */}
        {deleteConfirmId && (
          <div className="modal-overlay" onClick={handleCancelDelete}>
            <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Appointment</h3>
              <p>Are you sure you want to delete this appointment? This action cannot be undone.</p>
              <div className="modal-actions">
                <button className="danger" onClick={handleConfirmDelete} disabled={loading}>
                  {loading ? "Deleting..." : "Delete"}
                </button>
                <button type="button" className="secondary" onClick={handleCancelDelete} disabled={loading}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <CreateAppointmentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={async () => {
            setShowCreateModal(false);
            await loadAppointmentsByRange();
          }}
        />
      )}
    </div>
  );
}