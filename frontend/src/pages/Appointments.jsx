import { useEffect, useMemo, useState } from "react";
import AppointmentModal from "./components/AppointmentModal";
import FilterMenu from "./dashboard/FilterMenu";
import { periodLabel, periodRange, shiftAnchor, withYear, parseDay, pad } from "./dashboard/period";
import { DayView, MonthView, WeekView } from "./calendar/ScheduleViews";
import { asModalEvent } from "./calendar/util";
import { getCompanySettings } from "../api/settingsApi";
import {
  fetchMasters,
  fetchMyMaster,
  fetchClients,
  fetchServices,
  getAppointmentsByDateRange,
  updateAppointment,
  deleteAppointment,
} from "../api/api";

import CreateAppointmentModal from "./components/CreateAppointmentModal";

import { exportRowsToExcel } from "../utils/exportExcel";

import "./Dashboard.css";
import "./dashboard/dashboard.css";
import "./calendar/schedule.css";
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

  const [period, setPeriod] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [masters, setMasters] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);

  const [selectedMasters, setSelectedMasters] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);

  const [appointments, setAppointments] = useState([]);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editMasterId, setEditMasterId] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editServiceId, setEditServiceId] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editStatus, setEditStatus] = useState("planned");

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [settings, setSettings] = useState(null);
  const [weekMaster, setWeekMaster] = useState(""); // "" = all masters (summary)
  const [openAppt, setOpenAppt] = useState(null);
  const [createAt, setCreateAt] = useState(null); // { masterId, start }

  const canEditAppointment = (appointment) => {
    if (isAdmin) return true;
    if (isMaster) return Boolean(myMasterId) && appointment?.master_id === myMasterId;
    return false;
  };

  const range = useMemo(() => periodRange(period, currentDate), [period, currentDate]);
  const getDateRangeForAPI = () => ({ start: range.from, end: range.to });

  const handlePeriodChange = (newPeriod) => setPeriod(newPeriod);
  const pickDay = (d) => {
    setCurrentDate(parseDay(d));
    setPeriod("day");
  };
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const loadFilters = async () => {
    try {
      setError("");

      const [clientsData, servicesData, mastersData, me] = await Promise.all([
        fetchClients(token),
        fetchServices(token),
        fetchMasters(token),
        isMaster ? fetchMyMaster(token) : Promise.resolve(null),
      ]);

      setClients(clientsData);
      setServices(servicesData);
      setMasters(Array.isArray(mastersData) ? mastersData : []);
      setMyMasterId(me?.id || "");
      if (me?.id) setWeekMaster(me.id);
      getCompanySettings(token).then(setSettings).catch(() => {});
    } catch (err) {
      console.error("Failed to load filters:", err);
      setError(err.message || "Failed to load filters");
    }
  };

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

  useEffect(() => {
    if (token) loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, isMaster]);

  useEffect(() => {
    if (!token) return;
    loadAppointmentsByRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, range.from, range.to]);

  // ======= Helpers =======
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
    if (!id) return "—"; // ✅ show dash for Day Off
    return clients.find((c) => c.id === id)?.name || "Unknown";
  };
  const getServiceName = (id) => services.find((s) => s.id === id)?.name || "Unknown";
  const getServiceDuration = (id) => services.find((s) => s.id === id)?.duration || 0;

  const getServicePrice = (id) => services.find((s) => s.id === id)?.price ?? 0;
  const formatMoney = (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(n);
  };

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

  // ✅ NEW: allow appointments with client_id null to pass client filter (Day Off)
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const masterMatch = selectedMasters.length === 0 || selectedMasters.includes(apt.master_id);

      const clientMatch =
        !apt.client_id || selectedClients.length === 0 || selectedClients.includes(apt.client_id);

      const serviceMatch = selectedServices.length === 0 || selectedServices.includes(apt.service_id);

      return masterMatch && clientMatch && serviceMatch;
    });
  }, [appointments, selectedMasters, selectedClients, selectedServices]);

  // ======= Edit/Delete =======
  const handleEditClick = (appointment) => {
    if (!canEditAppointment(appointment)) return;

    setEditingId(appointment.id);
    setEditMasterId(appointment.master_id);
    setEditClientId(appointment.client_id || ""); // ✅ handle null
    setEditServiceId(appointment.service_id);
    setEditStartTime(appointment.start_time.slice(0, 16));
    setEditStatus(appointment.status);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;

    const apt = appointments.find((a) => a.id === editingId);
    if (!canEditAppointment(apt)) return;

    setError("");
    setLoading(true);

    try {
      await updateAppointment(token, editingId, {
        master_id: editMasterId,
        client_id: editClientId || null, // ✅ allow null (backend will enforce Day Off rules)
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

  const handleExportExcel = () => {
    const rows = filteredAppointments.map((a) => ({
      ID: a.id,
      Master: getMasterName(a.master_id),
      Client: getClientName(a.client_id),
      Service: getServiceName(a.service_id),
      "Service Price": getServicePrice(a.service_id),
      "Start Time": formatDateTime(a.start_time),
      Duration: `${getServiceDuration(a.service_id)} min`,
      Status: a.status,
    }));

    const range = getDateRangeForAPI();
    const fileName = `appointments_${range.start}_${range.end}.xlsx`;

    exportRowsToExcel(rows, "Appointments", fileName).catch((e) => alert("Export failed: " + e.message));
  };

  const customers = useMemo(() => clients.filter((c) => (c.type || "customer") === "customer"), [clients]);
  const visibleMasters = useMemo(
    () => masters.filter((m) => (m.is_active !== false) && (selectedMasters.length === 0 || selectedMasters.includes(m.id))),
    [masters, selectedMasters]
  );
  const weekMasterObj = masters.find((m) => m.id === weekMaster) || null;
  const colorOfMaster = (id) => masters.find((m) => m.id === id)?.color || "#03839a";
  const slotClick = isAdmin || isMaster
    ? (masterId, day, minutes) => {
        if (isMaster && !isAdmin && masterId !== myMasterId) return;
        setCreateAt({ masterId, start: `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` });
      }
    : null;

  return (
    <div className="dashboard-container">
      <div className="db db--embedded">
        <div className="db-bar db-card">
          <div className="db-bar__nav">
            <button type="button" className="db-icon-btn" aria-label={`Previous ${period}`} onClick={() => setCurrentDate((d) => shiftAnchor(period, d, -1))}>‹</button>
            <button type="button" className="db-today" onClick={() => setCurrentDate(new Date())}>Today</button>
            <button type="button" className="db-icon-btn" aria-label={`Next ${period}`} onClick={() => setCurrentDate((d) => shiftAnchor(period, d, 1))}>›</button>
            <span className="db-bar__range">{periodLabel(period, currentDate)}</span>
          </div>
          <label className="db-year">
            Year
            <select value={currentDate.getFullYear()} onChange={(e) => setCurrentDate((d) => withYear(d, Number(e.target.value)))}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <div className="db-seg" role="group" aria-label="Calendar view">
            {["day", "week", "month"].map((p) => (
              <button key={p} type="button" className={period === p ? "is-on" : ""} aria-pressed={period === p} onClick={() => handlePeriodChange(p)}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="db-bar__filters">
            {isAdmin && (
              <FilterMenu
                label="Masters"
                items={masters.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
                selected={selectedMasters}
                onChange={setSelectedMasters}
              />
            )}
            <FilterMenu
              label="Customers"
              items={customers.map((c) => ({ id: c.id, name: c.name }))}
              selected={selectedClients}
              onChange={setSelectedClients}
              searchable
            />
            <FilterMenu
              label="Services"
              items={services.map((s) => ({ id: s.id, name: s.name }))}
              selected={selectedServices}
              onChange={setSelectedServices}
              searchable
            />
          </div>
        </div>

        {error && <p className="db-error" role="alert">{error}</p>}

        <section className={`db-card sc-wrap ${loading ? "is-loading" : ""}`}>
          {period === "week" && (
            <div className="sc-toolbar">
              <label className="sc-master-pick">
                <span>Show</span>
                <select value={weekMaster} onChange={(e) => setWeekMaster(e.target.value)} disabled={isMaster && !isAdmin}>
                  {!isMaster && <option value="">All masters: summary per day</option>}
                  {visibleMasters.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              {weekMasterObj && <span className="sc-dot" style={{ background: weekMasterObj.color || "#03839a" }} aria-hidden="true" />}
            </div>
          )}
          {period === "day" && (
            <DayView
              day={range.from}
              masters={visibleMasters}
              appts={filteredAppointments}
              settings={settings}
              onOpen={setOpenAppt}
              onSlot={slotClick}
            />
          )}
          {period === "week" && (
            <WeekView
              days={range.days}
              master={weekMasterObj}
              masters={visibleMasters}
              appts={filteredAppointments}
              settings={settings}
              onOpen={setOpenAppt}
              onSlot={slotClick}
              onPickDay={pickDay}
            />
          )}
          {period === "month" && (
            <MonthView anchor={currentDate} appts={filteredAppointments} masters={visibleMasters} settings={settings} onPickDay={pickDay} />
          )}
        </section>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="container">
        <div className="appointments-header-row">
          <h2>Appointments</h2>

          <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
            + New Appointment
          </button>

          <button className="export-btn" type="button" onClick={handleExportExcel} disabled={loading}>
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
                <th>Price</th>
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
                      <td>{formatMoney(a.price ?? getServicePrice(a.service_id))}</td>
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
                          <span style={{ color: "#9ca3af", fontWeight: 600 }}>View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", color: "#9ca3af" }}>
                    No appointments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editingId && (
          <div className="modal-overlay" onClick={handleCancelEdit}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Edit Appointment</h3>
              <form onSubmit={handleSaveEdit}>
                <select
                  value={editMasterId}
                  onChange={(e) => setEditMasterId(e.target.value)}
                  required
                  disabled={loading || (isMaster && editMasterId !== myMasterId)}
                >
                  <option value="">Select Master</option>
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>

                <select
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  required={false}
                  disabled={loading}
                >
                  <option value="">No client</option>
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

      {(showCreateModal || createAt) && (
        <CreateAppointmentModal
          initialMasterId={createAt?.masterId || ""}
          initialStart={createAt?.start || ""}
          onClose={() => {
            setShowCreateModal(false);
            setCreateAt(null);
          }}
          onSuccess={async () => {
            setShowCreateModal(false);
            setCreateAt(null);
            await loadAppointmentsByRange();
          }}
        />
      )}
      {openAppt && (
        <AppointmentModal
          event={asModalEvent(openAppt, colorOfMaster(openAppt.master_id))}
          onClose={() => setOpenAppt(null)}
          onUpdate={loadAppointmentsByRange}
        />
      )}
    </div>
  );
}