import { useState, useEffect } from "react";
import { fetchUsers, createUser, updateUser, deleteUser } from "../api/api";
import * as XLSX from "xlsx";
import "./appointments.css";

export default function Users() {
  const token = localStorage.getItem("token");

  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Edit modal
  const [editingUser, setEditingUser] = useState(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers(token);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    }
  };

  useEffect(() => {
    if (!token) return;
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreate = async (payload) => {
    setError("");
    setLoading(true);
    try {
      await createUser(token, payload);
      setShowCreateModal(false);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, payload) => {
    setError("");
    setLoading(true);
    try {
      await updateUser(token, id, payload);
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setError("");
    setLoading(true);
    try {
      await deleteUser(token, deleteConfirmId);
      setDeleteConfirmId(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  // ======= Excel export =======
  const handleExportExcel = () => {
    const rows = users.map((u) => ({
      ID: u.id,
      Email: u.email,
      Role: u.role,
      Created: u.created_at ? new Date(u.created_at).toISOString() : "",
    }));

    const fileName = `users_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="container">
      <div className="appointments-header-row">
        <h2>Users</h2>

        <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
          + New User
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
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.length > 0 ? (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <span
                      style={{
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 800,
                        backgroundColor: u.role === "admin" ? "#fecaca" : "#dbeafe",
                        color: u.role === "admin" ? "#991b1b" : "#1e40af",
                        textTransform: "capitalize",
                      }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="actions">
                    <button type="button" className="secondary" onClick={() => setEditingUser(u)} disabled={loading}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setDeleteConfirmId(u.id)}
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

      {/* Create */}
      {showCreateModal && (
        <UserModal
          title="New User"
          loading={loading}
          initialValues={{ email: "", password: "", role: "master" }}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(values) => handleCreate(values)}
          submitLabel="Create"
          passwordHelp=""
        />
      )}

      {/* Edit */}
      {editingUser && (
        <UserModal
          title="Edit User"
          loading={loading}
          initialValues={{
            email: editingUser.email || "",
            password: "",
            role: editingUser.role || "master",
          }}
          onClose={() => setEditingUser(null)}
          onSubmit={(values) => {
            const updateData = {
              email: values.email,
              role: values.role,
            };
            if (values.password) updateData.password = values.password; // optional
            return handleUpdate(editingUser.id, updateData);
          }}
          submitLabel="Save"
          passwordHelp="Leave empty to keep current password"
        />
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Delete User</h3>
            <p>Are you sure you want to delete this user? This action cannot be undone.</p>
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

function UserModal({ title, initialValues, loading, onClose, onSubmit, submitLabel, passwordHelp }) {
  const [email, setEmail] = useState(initialValues.email);
  const [password, setPassword] = useState(initialValues.password);
  const [role, setRole] = useState(initialValues.role);

  useEffect(() => {
    setEmail(initialValues.email);
    setPassword(initialValues.password);
    setRole(initialValues.role);
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      email,
      password,
      role,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              placeholder="e.g., user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password {title.startsWith("Edit") ? "" : "*"}</label>
            <input
              type="password"
              placeholder={passwordHelp ? `Password (${passwordHelp})` : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!title.startsWith("Edit")}
              disabled={loading}
            />
            {passwordHelp ? (
              <small className="muted" style={{ marginTop: "4px", display: "block" }}>
                {passwordHelp}
              </small>
            ) : null}
          </div>

          <div className="form-group">
            <label>Role *</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} required disabled={loading}>
              <option value="master">Master</option>
              <option value="admin">Admin</option>
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