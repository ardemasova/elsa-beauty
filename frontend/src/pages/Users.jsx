import { useState, useEffect, useMemo } from "react";
import { fetchUsers, createUser, updateUser, deleteUser } from "../api/api";
import { fetchTenants } from "../api/tenantsApi";
import * as XLSX from "xlsx";
import "./Appointments.css";
import "./Users.css";

export default function Users() {
  const token = localStorage.getItem("token");

  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);

  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Edit modal
  const [editingUser, setEditingUser] = useState(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const tenantMap = useMemo(() => {
    const m = new Map();
    tenants.forEach((t) => m.set(t.id, t));
    return m;
  }, [tenants]);

  const loadTenants = async () => {
    try {
      const data = await fetchTenants(token);
      setTenants(Array.isArray(data) ? data : []);
    } catch (err) {
      // tenants are not strictly required for users table to render,
      // but required for filter + branch selector in modal
      console.error("Failed to load tenants:", err);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers(token, selectedTenantId ? { tenant_id: selectedTenantId } : {});
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    }
  };

  useEffect(() => {
    if (!token) return;
    loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedTenantId]);

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
      Branch: u.tenant_name || tenantMap.get(u.tenant_id)?.name || "",
      TenantID: u.tenant_id || "",
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
      <div className="users-header-row">
        <h2 className="users-title">Users</h2>

        <div className="users-header-controls">
          <select
            className="users-branch-filter"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            disabled={loading}
          >
            <option value="">All branches</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_active ? "" : "(inactive)"}
              </option>
            ))}
          </select>

          <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
            + New User
          </button>

          <button className="export-btn" type="button" onClick={handleExportExcel} disabled={loading}>
            Export to Excel
          </button>
        </div>
      </div>

      {error && <p className="appointments-error-message">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.length > 0 ? (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="users-email">{u.email}</td>
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

                  <td className="users-branch">
                    {u.tenant_name || tenantMap.get(u.tenant_id)?.name || "-"}
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
                <td colSpan="4" style={{ textAlign: "center", color: "#9ca3af" }}>
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
          tenants={tenants}
          initialValues={{ email: "", password: "", role: "master", tenant_id: selectedTenantId || "" }}
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
          tenants={tenants}
          initialValues={{
            email: editingUser.email || "",
            password: "",
            role: editingUser.role || "master",
            tenant_id: editingUser.tenant_id || "",
          }}
          onClose={() => setEditingUser(null)}
          onSubmit={(values) => {
            const updateData = {
              email: values.email,
              role: values.role,
              tenant_id: values.tenant_id || null,
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

function UserModal({ title, initialValues, loading, onClose, onSubmit, submitLabel, passwordHelp, tenants }) {
  const [email, setEmail] = useState(initialValues.email);
  const [password, setPassword] = useState(initialValues.password);
  const [role, setRole] = useState(initialValues.role);
  const [tenantId, setTenantId] = useState(initialValues.tenant_id);

  useEffect(() => {
    setEmail(initialValues.email);
    setPassword(initialValues.password);
    setRole(initialValues.role);
    setTenantId(initialValues.tenant_id);
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      email,
      password,
      role,
      tenant_id: tenantId || null,
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

          <div className="form-group">
            <label>Branch *</label>
            <select value={tenantId || ""} onChange={(e) => setTenantId(e.target.value)} required disabled={loading}>
              <option value="" disabled>
                Select branch...
              </option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_active ? "" : "(inactive)"}
                </option>
              ))}
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