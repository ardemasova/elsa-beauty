import { useState, useEffect } from "react";
import { fetchServices, createService, updateService, deleteService } from "../api/api";
import * as XLSX from "xlsx";
import "./appointments.css";

export default function Services() {
  const token = localStorage.getItem("token");

  const [services, setServices] = useState([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadServices = async () => {
    try {
      const data = await fetchServices(token);
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load services");
    }
  };

  useEffect(() => {
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calculateProfit = (price, cost) => {
    const p = Number(price) || 0;
    const c = Number(cost) || 0;
    return (p - c).toFixed(2);
  };

  const handleCreate = async (payload) => {
    setError("");
    setLoading(true);
    try {
      await createService(token, payload);
      setShowCreateModal(false);
      await loadServices();
    } catch (err) {
      setError(err.message || "Failed to create service");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, payload) => {
    setError("");
    setLoading(true);
    try {
      await updateService(token, id, payload);
      setEditingService(null);
      await loadServices();
    } catch (err) {
      setError(err.message || "Failed to update service");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setError("");
    setLoading(true);
    try {
      await deleteService(token, deleteConfirmId);
      setDeleteConfirmId(null);
      await loadServices();
    } catch (err) {
      setError(err.message || "Failed to delete service");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const rows = services.map((s) => {
      const price = Number(s.price) || 0;
      const cost = Number(s.cost) || 0;
      const profit = Number(price - cost);

      return {
        ID: s.id,
        Name: s.name,
        Duration: `${s.duration} min`,
        Price: price,
        Cost: cost,
        Profit: profit,
        Status: s.is_active ? "Active" : "Inactive",
      };
    });

    const fileName = `services_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Services");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="container">
      <div className="appointments-header-row">
        <h2>Services</h2>

        <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
          + New Service
        </button>

        <button className="export-btn" type="button" onClick={handleExportExcel} disabled={loading}>
          Export to Excel
        </button>
      </div>

      {error && <p className="appointments-error-message">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Profit</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {services.length > 0 ? (
              services.map((s) => {
                const profit = Number(calculateProfit(s.price, s.cost));
                const profitOk = profit >= 0;

                return (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.duration} min</td>
                    <td>${(Number(s.price) || 0).toFixed(2)}</td>
                    <td>${(Number(s.cost) || 0).toFixed(2)}</td>
                    <td style={{ fontWeight: 800, color: profitOk ? "#16a34a" : "#dc2626" }}>
                      ${profit.toFixed(2)}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 800,
                          backgroundColor: s.is_active ? "#dcfce7" : "#fee2e2",
                          color: s.is_active ? "#166534" : "#991b1b",
                        }}
                      >
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="actions">
                      <button type="button" className="secondary" onClick={() => setEditingService(s)} disabled={loading}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => setDeleteConfirmId(s.id)} disabled={loading}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", color: "#9ca3af" }}>
                  No services yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <ServiceModal
          title="New Service"
          loading={loading}
          initialValues={{
            name: "",
            duration: 60,
            price: 0,
            cost: 0,
            is_active: true,
          }}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(values) =>
            handleCreate({
              name: values.name,
              duration: values.duration,
              price: values.price,
              cost: values.cost,
              is_active: values.is_active,
            })
          }
          submitLabel="Create"
        />
      )}

      {editingService && (
        <ServiceModal
          title="Edit Service"
          loading={loading}
          initialValues={{
            name: editingService.name || "",
            duration: Number(editingService.duration) || 60,
            price: Number(editingService.price) || 0,
            cost: Number(editingService.cost) || 0,
            is_active: Boolean(editingService.is_active),
          }}
          onClose={() => setEditingService(null)}
          onSubmit={(values) =>
            handleUpdate(editingService.id, {
              name: values.name,
              duration: values.duration,
              price: values.price,
              cost: values.cost,
              is_active: values.is_active,
            })
          }
          submitLabel="Save"
        />
      )}

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Service</h3>
            <p>Are you sure you want to delete this service? This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="danger" onClick={handleConfirmDelete} disabled={loading}>
                {loading ? "Deleting..." : "Delete"}
              </button>
              <button type="button" className="secondary" onClick={() => setDeleteConfirmId(null)} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceModal({ title, initialValues, loading, onClose, onSubmit, submitLabel }) {
  const [name, setName] = useState(initialValues.name);
  const [duration, setDuration] = useState(initialValues.duration);
  const [price, setPrice] = useState(initialValues.price);
  const [cost, setCost] = useState(initialValues.cost);
  const [isActive, setIsActive] = useState(initialValues.is_active);

  useEffect(() => {
    setName(initialValues.name);
    setDuration(initialValues.duration);
    setPrice(initialValues.price);
    setCost(initialValues.cost);
    setIsActive(initialValues.is_active);
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name,
      duration: Number(duration),
      price: Number(price),
      cost: Number(cost),
      is_active: isActive,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Service Name *</label>
            <input
              type="text"
              placeholder="e.g., Haircut"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Duration (minutes) *</label>
            <input
              type="number"
              placeholder="e.g., 60"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min="1"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Price *</label>
            <input
              type="number"
              placeholder="e.g., 50.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              step="0.01"
              min="0"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Cost *</label>
            <input
              type="number"
              placeholder="e.g., 10.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              step="0.01"
              min="0"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              value={String(isActive)}
              onChange={(e) => setIsActive(e.target.value === "true")}
              disabled={loading}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : submitLabel}
            </button>
            <button type="button" className="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}