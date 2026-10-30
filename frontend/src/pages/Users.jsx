import { useState, useEffect, useMemo } from "react";
import { fetchUsers, createUser, updateUser, deleteUser } from "../api/api";
import { fetchTenants } from "../api/tenantsApi";
import { getTokenPayload } from "../auth/session";
import * as XLSX from "xlsx";
import "./Appointments.css";
import "./Users.css";

export default function Users() {
  const token = localStorage.getItem("token");
  const me = getTokenPayload(token);
  const isOwner = me?.accountRole === "owner";
  const myId = me?.sub;

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
          {isOwner && (
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
          )}

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
                        backgroundColor: u.role === "owner" ? "#ede9fe" : u.role === "admin" ? "#fecaca" : "#dbeafe",
                        color: u.role === "owner" ? "#5b21b6" : u.role === "admin" ? "#991b1b" : "#1e40af",
                        textTransform: "capitalize",
                      }}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td className="users-branch">
                    {u.role === "owner" ? "All branches" : u.tenant_name || tenantMap.get(u.tenant_id)?.name || "-"}
                  </td>

                  <td className="actions">
                    {(u.id === myId || (u.role !== "owner" && (isOwner || u.role === "master"))) && (
                      <button type="button" className="secondary" onClick={() => setEditingUser(u)} disabled={loading}>
                        Edit
                      </button>
                    )}
                    {u.id !== myId && u.role !== "owner" && (isOwner || u.role === "master") && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setDeleteConfirmId(u.id)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    )}
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
          isOwner={isOwner}
          initialValues={{ email: "", password: "", role: "master", tenant_ids: selectedTenantId ? [selectedTenantId] : tenants.length === 1 ? [tenants[0].id] : [] }}
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
          isOwner={isOwner}
          isSelf={editingUser.id === myId}
          initialValues={{
            email: editingUser.email || "",
            password: "",
            role: editingUser.role || "master",
            tenant_ids: editingUser.tenant_ids || [],
          }}
          onClose={() => setEditingUser(null)}
          onSubmit={(values) => {
            const updateData = { email: values.email, role: values.role };
            if (isOwner && editingUser.id !== myId) updateData.tenant_ids = values.tenant_ids;
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

function UserModal({ title, initialValues, loading, onClose, onSubmit, submitLabel, passwordHelp, tenants, isOwner, isSelf = false }) {
  const [email, setEmail] = useState(initialValues.email);
  const [password, setPassword] = useState(initialValues.password);
  const [role, setRole] = useState(initialValues.role);
  const [tenantIds, setTenantIds] = useState(initialValues.tenant_ids || []);
  const [formError, setFormError] = useState("");
  const isEdit = title.startsWith("Edit");

  // The modal is mounted fresh each time it opens, so initial state is enough
  // (re-syncing on every render used to wipe what the user was typing).
  // Owners assign branches; admins always add staff to their current branch.
  const showBranches = isOwner && !isSelf && role !== "owner";
  const canChooseRole = isOwner && !isSelf && role !== "owner";

  const toggleTenant = (id) =>
    setTenantIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password && password.length < 8) return setFormError("Password must be at least 8 characters");
    if (showBranches && tenantIds.length === 0) return setFormError("Choose at least one branch");
    setFormError("");
    onSubmit({ email, password, role, tenant_ids: tenantIds });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          {formError && <p className="appointments-error-message">{formError}</p>}

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
            <label>Password {isEdit ? "" : "*"}</label>
            <input
              type="password"
              placeholder={passwordHelp ? `Password (${passwordHelp})` : "At least 8 characters"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              minLength={isEdit && !password ? undefined : 8}
              disabled={loading}
              autoComplete="new-password"
            />
            {passwordHelp ? (
              <small className="muted" style={{ marginTop: "4px", display: "block" }}>
                {passwordHelp}
              </small>
            ) : null}
          </div>

          {canChooseRole ? (
            <div className="form-group">
              <label>Role *</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} required disabled={loading}>
                <option value="master">Master</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Role</label>
              <input value={role.charAt(0).toUpperCase() + role.slice(1)} disabled readOnly />
            </div>
          )}

          {showBranches && (
            <div className="form-group">
              <label>Branches *</label>
              <div style={{ display: "grid", gap: 6 }}>
                {tenants.map((t) => (
                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={tenantIds.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                      disabled={loading}
                      style={{ width: "auto" }}
                    />
                    {t.name} {t.is_active ? "" : "(inactive)"}
                  </label>
                ))}
              </div>
            </div>
          )}

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
