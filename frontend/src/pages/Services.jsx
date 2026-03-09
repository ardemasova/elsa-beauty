import { useState, useEffect, useMemo } from "react";
import {
  fetchServices,
  createService,
  updateService,
  deleteService,
  fetchItems,
  createItem,
  updateItem,
  deleteItem,
} from "../api/api";
import * as XLSX from "xlsx";
import "./Appointments.css";

export default function Services() {
  const token = localStorage.getItem("token");

  // Tabs (Payments-like)
  const [activeTab, setActiveTab] = useState("services"); // services | stock

  // Services
  const [services, setServices] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Items (Stock)
  const [items, setItems] = useState([]);
  const [showCreateItemModal, setShowCreateItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItemConfirmId, setDeleteItemConfirmId] = useState(null);

  // Common
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadServices = async () => {
    try {
      const data = await fetchServices(token);
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load services");
    }
  };

  const loadItems = async () => {
    try {
      const data = await fetchItems(token);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load items");
    }
  };

  useEffect(() => {
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load items when switching to stock
  useEffect(() => {
    if (activeTab === "stock") loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const calculateProfit = (price, cost) => {
    const p = Number(price) || 0;
    const c = Number(cost) || 0;
    return (p - c).toFixed(2);
  };

  // ===== Services CRUD =====
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

  const handleExportExcelServices = () => {
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

  // ===== Items CRUD =====
  const handleCreateItem = async (payload) => {
    setError("");
    setLoading(true);
    try {
      await createItem(token, payload);
      setShowCreateItemModal(false);
      await loadItems();
    } catch (err) {
      setError(err.message || "Failed to create item");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = async (id, payload) => {
    setError("");
    setLoading(true);
    try {
      await updateItem(token, id, payload);
      setEditingItem(null);
      await loadItems();
    } catch (err) {
      setError(err.message || "Failed to update item");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteItem = async () => {
    setError("");
    setLoading(true);
    try {
      await deleteItem(token, deleteItemConfirmId);
      setDeleteItemConfirmId(null);
      await loadItems();
    } catch (err) {
      setError(err.message || "Failed to delete item");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcelItems = () => {
    const rows = items.map((i) => {
      const price = Number(i.price) || 0;
      const cost = Number(i.cost) || 0;
      const profit = Number(price - cost);
      const qty = Number(i.stock_qty) || 0;

      return {
        ID: i.id,
        Name: i.name,
        Unit: i.unit,
        Price: price,
        Cost: cost,
        Profit: profit,
        "Stock Qty": qty,
        Status: i.is_active ? "Active" : "Inactive",
      };
    });

    const fileName = `items_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, fileName);
  };

  // Header actions depend on tab; title stays constant "Items"
  const headerActions = useMemo(() => {
    if (activeTab === "services") {
      return (
        <>
          <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)} disabled={loading}>
            + New Service
          </button>

          <button className="export-btn" type="button" onClick={handleExportExcelServices} disabled={loading}>
            Export to Excel
          </button>
        </>
      );
    }

    return (
      <>
        <button className="add-appointment-btn" onClick={() => setShowCreateItemModal(true)} disabled={loading}>
          + New Item
        </button>

        <button className="export-btn" type="button" onClick={handleExportExcelItems} disabled={loading}>
          Export to Excel
        </button>
      </>
    );
  }, [activeTab, loading, services, items]);

  return (
    <div className="container">
      {/* Header (Payments-like) */}
      <div className="appointments-header-row">
        <h2>Items</h2>
        {headerActions}
      </div>

      {/* Tabs (Payments-like) */}
      <div className="appointments-tabs">
        <button
          type="button"
          className={`tab ${activeTab === "services" ? "active" : ""}`}
          onClick={() => setActiveTab("services")}
          disabled={loading}
        >
          Services
        </button>

        <button
          type="button"
          className={`tab ${activeTab === "stock" ? "active" : ""}`}
          onClick={() => setActiveTab("stock")}
          disabled={loading}
        >
          Stock
        </button>
      </div>

      {error && <p className="appointments-error-message">{error}</p>}

      {/* SERVICES TAB */}
      {activeTab === "services" && (
        <>
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
        </>
      )}

      {/* STOCK TAB */}
      {activeTab === "stock" && (
        <>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Stock Qty</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {items.length > 0 ? (
                  items.map((i) => {
                    const profit = Number(calculateProfit(i.price, i.cost));
                    const profitOk = profit >= 0;

                    return (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td>{i.unit}</td>
                        <td>${(Number(i.price) || 0).toFixed(2)}</td>
                        <td>${(Number(i.cost) || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 800, color: profitOk ? "#16a34a" : "#dc2626" }}>
                          ${profit.toFixed(2)}
                        </td>
                        <td>{(Number(i.stock_qty) || 0).toString()}</td>
                        <td>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: 800,
                              backgroundColor: i.is_active ? "#dcfce7" : "#fee2e2",
                              color: i.is_active ? "#166534" : "#991b1b",
                            }}
                          >
                            {i.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="actions">
                          <button type="button" className="secondary" onClick={() => setEditingItem(i)} disabled={loading}>
                            Edit
                          </button>
                          <button type="button" className="danger" onClick={() => setDeleteItemConfirmId(i.id)} disabled={loading}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", color: "#9ca3af" }}>
                      No items yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showCreateItemModal && (
            <ItemModal
              title="New Item"
              loading={loading}
              initialValues={{
                name: "",
                unit: "pcs",
                price: 0,
                cost: 0,
                stock_qty: 0,
                is_active: true,
              }}
              onClose={() => setShowCreateItemModal(false)}
              onSubmit={(values) =>
                handleCreateItem({
                  name: values.name,
                  unit: values.unit,
                  price: values.price,
                  cost: values.cost,
                  stock_qty: values.stock_qty,
                  is_active: values.is_active,
                })
              }
              submitLabel="Create"
            />
          )}

          {editingItem && (
            <ItemModal
              title="Edit Item"
              loading={loading}
              initialValues={{
                name: editingItem.name || "",
                unit: editingItem.unit || "pcs",
                price: Number(editingItem.price) || 0,
                cost: Number(editingItem.cost) || 0,
                stock_qty: Number(editingItem.stock_qty) || 0,
                is_active: Boolean(editingItem.is_active),
              }}
              onClose={() => setEditingItem(null)}
              onSubmit={(values) =>
                handleUpdateItem(editingItem.id, {
                  name: values.name,
                  unit: values.unit,
                  price: values.price,
                  cost: values.cost,
                  stock_qty: values.stock_qty,
                  is_active: values.is_active,
                })
              }
              submitLabel="Save"
            />
          )}

          {deleteItemConfirmId && (
            <div className="modal-overlay" onClick={() => setDeleteItemConfirmId(null)}>
              <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
                <h3>Delete Item</h3>
                <p>Are you sure you want to delete this item? This action cannot be undone.</p>
                <div className="modal-actions">
                  <button className="danger" onClick={handleConfirmDeleteItem} disabled={loading}>
                    {loading ? "Deleting..." : "Delete"}
                  </button>
                  <button type="button" className="secondary" onClick={() => setDeleteItemConfirmId(null)} disabled={loading}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
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
            <select value={String(isActive)} onChange={(e) => setIsActive(e.target.value === "true")} disabled={loading}>
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

function ItemModal({ title, initialValues, loading, onClose, onSubmit, submitLabel }) {
  const [name, setName] = useState(initialValues.name);
  const [unit, setUnit] = useState(initialValues.unit);
  const [price, setPrice] = useState(initialValues.price);
  const [cost, setCost] = useState(initialValues.cost);
  const [stockQty, setStockQty] = useState(initialValues.stock_qty);
  const [isActive, setIsActive] = useState(initialValues.is_active);

  useEffect(() => {
    setName(initialValues.name);
    setUnit(initialValues.unit);
    setPrice(initialValues.price);
    setCost(initialValues.cost);
    setStockQty(initialValues.stock_qty);
    setIsActive(initialValues.is_active);
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name,
      unit,
      price: Number(price),
      cost: Number(cost),
      stock_qty: Number(stockQty),
      is_active: isActive,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Item Name *</label>
            <input
              type="text"
              placeholder="e.g., Shampoo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Unit *</label>
            <input
              type="text"
              placeholder="e.g., pcs / ml / g"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Price *</label>
            <input
              type="number"
              placeholder="e.g., 20.00"
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
              placeholder="e.g., 8.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              step="0.01"
              min="0"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Stock Qty</label>
            <input
              type="number"
              placeholder="e.g., 10"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              step="0.001"
              min="0"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Status</label>
            <select value={String(isActive)} onChange={(e) => setIsActive(e.target.value === "true")} disabled={loading}>
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