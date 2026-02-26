import { useState, useEffect } from "react";
import { fetchUsers, createUser, updateUser, deleteUser } from "../api/api";
import "./Appointments.css"; // Используем общие стили

export default function Users() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("master");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("token");
  const [password, setPassword] = useState("");

  // Состояние для редактирования
  const [editingId, setEditingId] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("master");
  const [editPassword, setEditPassword] = useState("");

  // Состояние для подтверждения удаления
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers(token);
      setUsers(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (token) {
      loadUsers();
    }
  }, [token]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await createUser(token, { email, password, role });
      setEmail("");
      setPassword("");
      setRole("master");
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Открыть форму редактирования
  const handleEditClick = (user) => {
    setEditingId(user.id);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPassword("");
  };

  // Сохранить изменения
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const updateData = {
        email: editEmail,
        role: editRole,
      };

      // Если пароль не пустой, добавляем его
      if (editPassword) {
        updateData.password = editPassword;
      }

      await updateUser(token, editingId, updateData);

      setEditingId(null);
      setEditEmail("");
      setEditRole("master");
      setEditPassword("");

      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Отменить редактирование
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditEmail("");
    setEditRole("master");
    setEditPassword("");
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
      await deleteUser(token, deleteConfirmId);
      setDeleteConfirmId(null);
      loadUsers();
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

  return (
    <div className="container">
      <h2>Users</h2>
      {error && <p style={{ color: "#dc2626", fontWeight: "500" }}>{error}</p>}

      <div className="card">
        <form onSubmit={handleAdd}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <select 
            value={role} 
            onChange={e => setRole(e.target.value)}
            disabled={loading}
          >
            <option value="master">Master</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add User"}
          </button>
        </form>

        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? (
              users.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <span style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      backgroundColor: u.role === "admin" ? "#fecaca" : "#dbeafe",
                      color: u.role === "admin" ? "#991b1b" : "#1e40af",
                      textTransform: "capitalize",
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td className="actions">
                    <button 
                      className="secondary"
                      onClick={() => handleEditClick(u)}
                      disabled={loading}
                    >
                      Edit
                    </button>
                    <button 
                      className="danger"
                      onClick={() => handleDeleteClick(u.id)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" style={{ textAlign: "center", color: "#9ca3af" }}>
                  No users yet
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
            <h3>Edit User</h3>
            <form onSubmit={handleSaveEdit}>
              <input
                type="email"
                placeholder="Email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                required
                disabled={loading}
              />

              <input
                type="password"
                placeholder="Password (leave empty to keep current)"
                value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
                disabled={loading}
              />

              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                required
                disabled={loading}
              >
                <option value="master">Master</option>
                <option value="admin">Admin</option>
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
            <h3>Delete User</h3>
            <p>Are you sure you want to delete this user? This action cannot be undone.</p>
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