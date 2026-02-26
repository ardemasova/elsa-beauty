import { useState, useEffect } from "react";
import { 
  fetchAppointments, 
  createAppointment, 
  updateAppointment, 
  deleteAppointment,
  fetchMasters,
  fetchClients,
  fetchServices
} from "../api/api";

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [masters, setMasters] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);

  const [masterId, setMasterId] = useState("");
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startTime, setStartTime] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("token");

  // Состоян��е для редактирования
  const [editingId, setEditingId] = useState(null);
  const [editMasterId, setEditMasterId] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editServiceId, setEditServiceId] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editStatus, setEditStatus] = useState("planned");

  // Состояние для подтверждения удаления
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // загрузка данных
  const loadAppointments = async () => {
    try {
      const data = await fetchAppointments(token);
      setAppointments(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadMasters = async () => {
    try {
      const data = await fetchMasters(token);
      setMasters(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadClients = async () => {
    try {
      const data = await fetchClients(token);
      setClients(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadServices = async () => {
    try {
      const data = await fetchServices(token);
      setServices(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Загружать все данные когда токен готов
  useEffect(() => {
    if (token) {
      loadAppointments();
      loadMasters();
      loadClients();
      loadServices();
    }
  }, [token]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await createAppointment(token, {
        master_id: masterId,
        client_id: clientId,
        service_id: serviceId,
        start_time: startTime,
      });

      setMasterId("");
      setClientId("");
      setServiceId("");
      setStartTime("");

      loadAppointments();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Открыть форму редактирования
  const handleEditClick = (appointment) => {
    setEditingId(appointment.id);
    setEditMasterId(appointment.master_id);
    setEditClientId(appointment.client_id);
    setEditServiceId(appointment.service_id);
    setEditStartTime(appointment.start_time.slice(0, 16));
    setEditStatus(appointment.status);
  };

  // Сохранить изменения
  const handleSaveEdit = async (e) => {
    e.preventDefault();
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

      loadAppointments();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Отменить редактирование
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditMasterId("");
    setEditClientId("");
    setEditServiceId("");
    setEditStartTime("");
    setEditStatus("planned");
  };

  // Открыть диалог подтверждения удаления
  const handleDeleteClick = (id) => {
    setDeleteConfirmId(id);
  };

  // Подтвердить удаление
  const handleConfirmDelete = async () => {
    setError("");
    setLoading(true);

    try {
      await deleteAppointment(token, deleteConfirmId);
      setDeleteConfirmId(null);
      loadAppointments();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Отменить удаление
  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  // Форматирование даты и времени
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Получить названия по ID
  const getMasterName = (id) => {
    const master = masters.find(m => m.id === id);
    return master ? master.name : "Unknown";
  };

  const getClientName = (id) => {
    const client = clients.find(c => c.id === id);
    return client ? client.name : "Unknown";
  };

  const getServiceName = (id) => {
    const service = services.find(s => s.id === id);
    return service ? service.name : "Unknown";
  };

  // Получить duration услуги
  const getServiceDuration = (id) => {
    const service = services.find(s => s.id === id);
    return service ? service.duration : 0;
  };

  // Получить статус цвет
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

  return (
    <div className="container">
      <h2>Appointments</h2>
      {error && <p style={{ color: "#dc2626", fontWeight: "500" }}>{error}</p>}

      <div className="card">
        <form onSubmit={handleAdd}>
          <select
            value={masterId}
            onChange={e => setMasterId(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Select Master</option>
            {masters.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Select Client</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={serviceId}
            onChange={e => setServiceId(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Select Service</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration} min)
              </option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            required
            disabled={loading}
          />

          <button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add Appointment"}
          </button>
        </form>

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
            {appointments.length > 0 ? (
              appointments.map(a => (
                <tr key={a.id}>
                  <td>{getMasterName(a.master_id)}</td>
                  <td>{getClientName(a.client_id)}</td>
                  <td>{getServiceName(a.service_id)}</td>
                  <td>{formatDateTime(a.start_time)}</td>
                  <td>{getServiceDuration(a.service_id)} min</td>
                  <td>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "500",
                      backgroundColor: getStatusColor(a.status).bg,
                      color: getStatusColor(a.status).color,
                    }}>
                      {a.status}
                    </span>
                  </td>
                  <td className="actions">
                    <button 
                      className="secondary"
                      onClick={() => handleEditClick(a)}
                      disabled={loading}
                    >
                      Edit
                    </button>
                    <button 
                      className="danger"
                      onClick={() => handleDeleteClick(a.id)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
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
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Edit Appointment</h3>
            <form onSubmit={handleSaveEdit}>
              <select
                value={editMasterId}
                onChange={e => setEditMasterId(e.target.value)}
                required
                disabled={loading}
              >
                <option value="">Select Master</option>
                {masters.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                value={editClientId}
                onChange={e => setEditClientId(e.target.value)}
                required
                disabled={loading}
              >
                <option value="">Select Client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={editServiceId}
                onChange={e => setEditServiceId(e.target.value)}
                required
                disabled={loading}
              >
                <option value="">Select Service</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration} min)
                  </option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={editStartTime}
                onChange={e => setEditStartTime(e.target.value)}
                required
                disabled={loading}
              />

              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                disabled={loading}
              >
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <div className="modal-actions">
                <button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save"}
                </button>
                <button 
                  type="button" 
                  className="secondary"
                  onClick={handleCancelEdit}
                  disabled={loading}
                >
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
          <div className="modal-content modal-confirm" onClick={e => e.stopPropagation()}>
            <h3>Delete Appointment</h3>
            <p>Are you sure you want to delete this appointment? This action cannot be undone.</p>
            <div className="modal-actions">
              <button 
                className="danger"
                onClick={handleConfirmDelete}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
              <button 
                type="button" 
                className="secondary"
                onClick={handleCancelDelete}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}