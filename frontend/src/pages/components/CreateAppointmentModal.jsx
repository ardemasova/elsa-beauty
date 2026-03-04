import { useEffect, useMemo, useState } from "react";
import {
  fetchMasters,
  fetchMyMaster,
  fetchClients,
  fetchServices,
  createAppointment,
} from "../../api/api";
import "./CreateAppointmentModal.css";

function decodeToken(token) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

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
  const tokenPayload = useMemo(() => decodeToken(token), [token]);
  const isAdmin = tokenPayload?.role === "admin";

  useEffect(() => {
    if (!token) return;
    loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin]);

  const loadFilters = async () => {
    try {
      setError("");

      // ✅ masters: admin -> /masters, master -> /masters/me
      let mastersData = [];
      if (isAdmin) {
        mastersData = await fetchMasters(token);
      } else {
        const me = await fetchMyMaster(token);
        mastersData = me ? [me] : [];
      }

      const clientsData = await fetchClients(token);
      const servicesData = await fetchServices(token);

      setMasters(mastersData);
      setClients(clientsData);
      setServices(servicesData);

      // For master role: preselect and lock master id
      if (!isAdmin && mastersData[0]?.id) {
        setMasterId(mastersData[0].id);
      }
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

  const masterSelectDisabled = loading || !isAdmin; // ✅ master cannot choose another master

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <h2>New Appointment</h2>

        {error && <p className="error-message">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Master</label>
            <select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              required
              disabled={masterSelectDisabled}
            >
              <option value="">{isAdmin ? "Select Master" : "Loading..."}</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
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
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration} min)
                </option>
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