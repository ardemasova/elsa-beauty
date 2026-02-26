import { useState, useEffect } from "react";
import { fetchServices, createService, updateService, deleteService } from "../api/api";
import "./Appointments.css";

export default function Services() {
  const [services, setServices] = useState([]);

  const [name, setName] = useState("");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(0);
  const [cost, setCost] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("token");

  // Состояние для редактирования
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState(60);
  const [editPrice, setEditPrice] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [editIsActive, setEditIsActive] = useState(true);

  // Состояние для подтверждения удаления
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // загрузка услуг
  const loadServices = async () => {
    try {
      const data = await fetchServices(token);
      setServices(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await createService(token, {
        name,
        duration,
        price,
        cost,
        is_active: isActive,
      });

      setName("");
      setDuration(60);
      setPrice(0);
      setCost(0);
      setIsActive(true);

      loadServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Открыть форму редактирования
  const handleEditClick = (service) => {
    setEditingId(service.id);
    setEditName(service.name);
    setEditDuration(service.duration);
    setEditPrice(parseFloat(service.price));
    setEditCost(parseFloat(service.cost));
    setEditIsActive(service.is_active);
  };

  // Сохранить изменения
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await updateService(token, editingId, {
        name: editName,
        duration: editDuration,
        price: editPrice,
        cost: editCost,
        is_active: editIsActive,
      });

      setEditingId(null);
      setEditName("");
      setEditDuration(60);
      setEditPrice(0);
      setEditCost(0);
      setEditIsActive(true);

      loadServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Отменить редактирование
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDuration(60);
    setEditPrice(0);
    setEditCost(0);
    setEditIsActive(true);
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
      await deleteService(token, deleteConfirmId);
      setDeleteConfirmId(null);
      loadServices();
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

  // Расчет маржи (profit = price - cost)
  const calculateProfit = (price, cost) => {
    return (price - cost).toFixed(2);
  };

  return (
    <div className="container">
      <h2>Services</h2>
      {error && <p style={{ color: "#dc2626", fontWeight: "500" }}>{error}</p>}

      <div className="card">
        <form onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Service name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            disabled={loading}
          />

          <input
            type="number"
            placeholder="Duration (minutes)"
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            min="1"
            required
            disabled={loading}
          />

          <input
            type="number"
            placeholder="Price"
            value={price}
            onChange={e => setPrice(Number(e.target.value))}
            step="0.01"
            min="0"
            required
            disabled={loading}
          />

          <input
            type="number"
            placeholder="Cost"
            value={cost}
            onChange={e => setCost(Number(e.target.value))}
            step="0.01"
            min="0"
            required
            disabled={loading}
          />

          <select
            value={isActive}
            onChange={e => setIsActive(e.target.value === "true")}
            disabled={loading}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add Service"}
          </button>
        </form>

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
              services.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.duration} min</td>
                  <td>${parseFloat(s.price).toFixed(2)}</td>
                  <td>${parseFloat(s.cost).toFixed(2)}</td>
                  <td style={{ fontWeight: "600", color: calculateProfit(s.price, s.cost) >= 0 ? "#16a34a" : "#dc2626" }}>
                    ${calculateProfit(s.price, s.cost)}
                  </td>
                  <td>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "500",
                      backgroundColor: s.is_active ? "#dcfce7" : "#fee2e2",
                      color: s.is_active ? "#166534" : "#991b1b",
                    }}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="actions">
                    <button 
                      className="secondary"
                      onClick={() => handleEditClick(s)}
                      disabled={loading}
                    >
                      Edit
                    </button>
                    <button 
                      className="danger"
                      onClick={() => handleDeleteClick(s.id)}
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
                  No services yet
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
            <h3>Edit Service</h3>
            <form onSubmit={handleSaveEdit}>
              <input
                type="text"
                placeholder="Service name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                disabled={loading}
              />

              <input
                type="number"
                placeholder="Duration (minutes)"
                value={editDuration}
                onChange={e => setEditDuration(Number(e.target.value))}
                min="1"
                required
                disabled={loading}
              />

              <input
                type="number"
                placeholder="Price"
                value={editPrice}
                onChange={e => setEditPrice(Number(e.target.value))}
                step="0.01"
                min="0"
                required
                disabled={loading}
              />

              <input
                type="number"
                placeholder="Cost"
                value={editCost}
                onChange={e => setEditCost(Number(e.target.value))}
                step="0.01"
                min="0"
                required
                disabled={loading}
              />

              <select
                value={editIsActive}
                onChange={e => setEditIsActive(e.target.value === "true")}
                disabled={loading}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
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
            <h3>Delete Service</h3>
            <p>Are you sure you want to delete this service? This action cannot be undone.</p>
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