import { useState } from "react";
import { updateAppointment, deleteAppointment } from "../../api/api";
import "./AppointmentModal.css";

export default function AppointmentModal({ event, onClose, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editStatus, setEditStatus] = useState(event.extendedProps.status);
  const token = localStorage.getItem("token");

  const data = event.extendedProps;
  const startTime = new Date(event.start);
  const endTime = new Date(event.end);

  // Конвертируем цену в число
  const price = parseFloat(data.servicePrice) || 0;

  const handleDelete = async () => {
    if (!window.confirm("Delete this appointment?")) return;

    setLoading(true);
    try {
      await deleteAppointment(token, event.id);
      onUpdate();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to delete appointment");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    setLoading(true);
    try {
      await updateAppointment(token, event.id, {
        master_id: data.originalData.master_id,
        client_id: data.originalData.client_id,
        service_id: data.originalData.service_id,
        start_time: data.originalData.start_time,
        status: editStatus,
      });
      onUpdate();
      setIsEditing(false);
    } catch (err) {
      setError(err.message || "Failed to update appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="appointment-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="appointment-header">
          <h2>{data.serviceName}</h2>
          <span className={`status-badge status-${data.status}`}>{data.status}</span>
        </div>

        <div className="appointment-body">
          <div className="info-section">
            <h3 className="section-title">Details</h3>
            
            <div className="info-row">
              <span className="info-label">Master:</span>
              <span className="info-value">{data.masterName}</span>
            </div>

            <div className="info-row">
              <span className="info-label">Client:</span>
              <span className="info-value">{data.clientName}</span>
            </div>

            <div className="info-row">
              <span className="info-label">Service:</span>
              <span className="info-value">{data.serviceName}</span>
            </div>

            <div className="info-row">
              <span className="info-label">Start Time:</span>
              <span className="info-value">
                {startTime.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">End Time:</span>
              <span className="info-value">
                {endTime.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">Duration:</span>
              <span className="info-value">
                {Math.round((endTime - startTime) / 60000)} min
              </span>
            </div>

            <div className="info-row">
              <span className="info-label">Price:</span>
              <span className="info-value price">
                ${price.toFixed(2)}
              </span>
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}

          {isEditing ? (
            <div className="info-section">
              <h3 className="section-title">Edit Status</h3>
              
              <div className="form-group">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={loading}
                  className="status-select"
                >
                  <option value="planned">Planned</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  className="btn-save"
                  onClick={handleStatusUpdate}
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Status"}
                </button>
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setIsEditing(false);
                    setEditStatus(data.status);
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              <button
                className="btn-edit"
                onClick={() => setIsEditing(true)}
                disabled={loading}
              >
                Edit Status
              </button>
              <button
                className="btn-delete"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
              <button className="btn-close" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}