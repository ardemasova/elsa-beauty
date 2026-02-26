import { useState, useEffect } from "react";
import { fetchMasters, createMaster, fetchUsers, updateMaster, deleteMaster } from "../api/api";
import "./Appointments.css";

export default function Masters() {
  const [masters, setMasters] = useState([]);
  const [users, setUsers] = useState([]);
  const [name, setName] = useState("");
  const [commission, setCommission] = useState(40);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("token");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCommission, setEditCommission] = useState(40);
  const [editUserId, setEditUserId] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [openDropdown, setOpenDropdown] = useState(null);

  const loadMasters = async () => {
    try {
      const data = await fetchMasters(token);
      setMasters(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers(token);
      setUsers(data.filter(u => u.role === "master"));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadMasters();
    loadUsers();

    const handleClickOutside = () => {
      setOpenDropdown(null);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await createMaster(token, { name, commission, userId });
      setName("");
      setCommission(40);
      setUserId("");
      loadMasters();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (master) => {
    setEditingId(master.id);
    setEditName(master.name);
    setEditCommission(master.commission);
    setEditUserId(master.user_id);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await updateMaster(token, editingId, {
        name: editName,
        commission: editCommission,
        userId: editUserId
      });
      setEditingId(null);
      setEditName("");
      setEditCommission(40);
      setEditUserId("");
      loadMasters();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCommission(40);
    setEditUserId("");
  };

  const handleDeleteClick = (id) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = async () => {
    setError("");
    setLoading(true);

    try {
      await deleteMaster(token, deleteConfirmId);
      setDeleteConfirmId(null);
      loadMasters();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const getUserEmail = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? user.email : "Unknown";
  };

  return (
    <div className="container">
      <h2>Masters</h2>
      {error && <p style={{ color: "#dc2626", fontWeight: "500" }}>{error}</p>}

      <div className="card">
        <form onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Master name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            disabled={loading}
          />

          <input
            type="number"
            placeholder="Commission %"
            value={commission}
            onChange={e => setCommission(Number(e.target.value))}
            min="0"
            max="100"
            required
            disabled={loading}
          />

          <select
            value={userId}
            onChange={e => setUserId(e.target.value)}
            required
            disabled={loading}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">Select user</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add Master"}
          </button>
        </form>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Commission</th>
              <th>Email</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {masters.length > 0 ? (
              masters.map(m => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.commission}%</td>
                  <td>{getUserEmail(m.user_id)}</td>
                  <td className="actions">
                    <button 
                      className="secondary"
                      onClick={() => handleEditClick(m)}
                      disabled={loading}
                    >
                      Edit
                    </button>
                    <button 
                      className="danger"
                      onClick={() => handleDeleteClick(m.id)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" style={{ textAlign: "center", color: "#9ca3af" }}>
                  No masters yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Edit Master</h3>
            <form onSubmit={handleSaveEdit}>
              <input
                type="text"
                placeholder="Master name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
                disabled={loading}
              />

              <input
                type="number"
                placeholder="Commission %"
                value={editCommission}
                onChange={e => setEditCommission(Number(e.target.value))}
                min="0"
                max="100"
                required
                disabled={loading}
              />

              <select
                value={editUserId}
                onChange={e => setEditUserId(e.target.value)}
                required
                disabled={loading}
              >
                <option value="">Select user</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
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

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-content modal-confirm" onClick={e => e.stopPropagation()}>
            <h3>Delete Master</h3>
            <p>Are you sure you want to delete this master? This action cannot be undone.</p>
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