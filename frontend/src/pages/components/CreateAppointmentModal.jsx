import { useState, useEffect } from "react";
import { fetchMasters, fetchClients, fetchServices, createAppointment } from "../../api/api";
import "./CreateAppointmentModal.css";

export default function CreateAppointmentModal({ onClose, onSuccess }) {
  const [masters, setMasters] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [masterId, setMasterId] = useState("");
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startTime, setStartTime] = useState("");

  const token = localStorage.getItem("token");

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const mastersData = await fetchMasters(token);
      const clientsData = await fetchClients(token);
      const servicesData = await fetchServices(token);

      setMasters(mastersData);
      setClients(clientsData);
      setServices(servicesData);
    } catch (err) {
      setError(err.message || "Failed to load data");
    }
  };

  const handleSubmit = async (e) => {
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

      onSuccess();
    } catch (err) {
      setError(err.message || "Failed to create appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <h2>New Appointment</h2>

        {error && <p className="error-message">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Master</label>
            <select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              required
              disabled={loading}
            >
              <option value="">Select Master</option>
              {masters.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              disabled={loading}
            >
              <option value="">Select Client</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Service</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              disabled={loading}
            >
              <option value="">Select Service</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-actions">
            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? "Creating..." : "Create Appointment"}
            </button>
            <button type="button" onClick={onClose} disabled={loading} className="btn-cancel">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}