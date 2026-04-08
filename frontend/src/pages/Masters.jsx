import { useState, useEffect } from "react";
import { fetchMasters, fetchUsers, createMaster, updateMaster, deleteMaster } from "../api/api";
import PhotoUpload from "../components/PhotoUpload";
import { toAbsoluteUploadUrl } from "../api/uploadApi";
import * as XLSX from "xlsx";
import "./Appointments.css";

const AVATAR_SIZE = 54;

function AvatarCell({ url, alt }) {
  return url ? (
    <img
      src={toAbsoluteUploadUrl(url)}
      alt={alt}
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid rgba(0, 80, 103, 0.20)",
        display: "block",
        margin: "0 auto",
      }}
      loading="lazy"
    />
  ) : (
    <div
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: "50%",
        background: "#f3f4f6",
        border: "2px dashed rgba(0, 80, 103, 0.20)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto",
        color: "#9ca3af",
        fontWeight: 700,
        fontSize: 12,
      }}
      title="No photo"
    >
      —
    </div>
  );
}

export default function Masters() {
  const token = localStorage.getItem("token");

  const [masters, setMasters] = useState([]);
  const [users, setUsers] = useState([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMaster, setEditingMaster] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const loadMasters = async () => {
    try {
      const data = await fetchMasters(token);
      setMasters(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers(token);
      setUsers(Array.isArray(data) ? data.filter((u) => u.role === "master") : []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadMasters();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getUserEmail = (userId) => {
    const user = users.find((u) => String(u.id) === String(userId));
    return user ? user.email : "Unknown";
  };

  const handleCreate = async (payload) => {
    setError("");
    setLoading(true);
    try {
      const created = await createMaster(token, payload);
      setShowCreateModal(false);
      await loadMasters();
      return created;
    } catch (err) {
      setError(err.message || "Failed to create master");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, payload) => {
    setError("");
    setLoading(true);
    try {
      await updateMaster(token, id, payload);
      setEditingMaster(null);
      await loadMasters();
    } catch (err) {
      setError(err.message || "Failed to update master");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setError("");
    setLoading(true);
    try {
      await deleteMaster(token, deleteConfirmId);
      setDeleteConfirmId(null);
      await loadMasters();
    } catch (err) {
      setError(err.message || "Failed to delete master");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const rows = masters.map((m) => ({
      ID: m.id,
      Name: m.name,
      Commission: `${m.commission}%`,
      Email: getUserEmail(m.user_id),
      Photo: m.photo_url || "",
    }));

    const fileName = `masters_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Masters");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="container">
      <div className="appointments-header-row">
        <h2>Masters</h2>

        <button className="add-appointment-btn" onClick={() => setShowCreateModal(true)}>
          + New Master
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
              <th style={{ width: 80 }}></th>
              <th>Name</th>
              <th>Commission</th>
              <th>Email</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {masters.length > 0 ? (
              masters.map((m) => (
                <tr key={m.id}>
                  <td>
                    <AvatarCell url={m.photo_url} alt={`${m.name} photo`} />
                  </td>

                  <td>{m.name}</td>
                  <td>{m.commission}%</td>
                  <td>{getUserEmail(m.user_id)}</td>

                  <td className="actions">
                    <button type="button" className="secondary" onClick={() => setEditingMaster(m)} disabled={loading}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => setDeleteConfirmId(m.id)} disabled={loading}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", color: "#9ca3af" }}>
                  No masters yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <MasterModal
          title="New Master"
          loading={loading}
          users={users}
          initialValues={{
            name: "",
            commission: 40,
            userId: "",
            email: "",
            photo_url: "",
          }}
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (values) => {
            const created = await handleCreate({
              name: values.name,
              commission: values.commission,
              userId: values.userId,
              email: values.email,
            });
            setEditingMaster(created);
          }}
          submitLabel="Create"
          token={token}
          onPhotoUploaded={() => {}}
        />
      )}

      {editingMaster && (
        <MasterModal
          title="Edit Master"
          loading={loading}
          users={users}
          initialValues={{
            id: editingMaster.id,
            photo_url: editingMaster.photo_url || "",
            name: editingMaster.name || "",
            commission: editingMaster.commission ?? 40,
            userId: editingMaster.user_id ? String(editingMaster.user_id) : "",
            email: getUserEmail(editingMaster.user_id),
          }}
          onClose={() => setEditingMaster(null)}
          onSubmit={(values) =>
            handleUpdate(editingMaster.id, {
              name: values.name,
              commission: values.commission,
              userId: values.userId,
              email: values.email,
            })
          }
          submitLabel="Save"
          token={token}
          onPhotoUploaded={(newUrl) => {
            setEditingMaster((prev) => ({ ...prev, photo_url: newUrl }));
            loadMasters();
          }}
        />
      )}

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Master</h3>
            <p>Are you sure you want to delete this master? This action cannot be undone.</p>
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

// MasterModal без изменений (оставьте как у вас)

function MasterModal({
  title,
  initialValues,
  users,
  loading,
  onClose,
  onSubmit,
  submitLabel,
  token,
  onPhotoUploaded,
}) {
  const [name, setName] = useState(initialValues.name);
  const [email, setEmail] = useState(initialValues.email || "");
  const [commission, setCommission] = useState(initialValues.commission);
  const [userId, setUserId] = useState(initialValues.userId);

  // photo can be edited only when we have master id (edit modal)
  const masterId = initialValues.id;
  const photoUrl = initialValues.photo_url || "";

  useEffect(() => {
    setName(initialValues.name);
    setEmail(initialValues.email || "");
    setCommission(initialValues.commission);
    setUserId(initialValues.userId);
  }, [initialValues]);

  useEffect(() => {
    if (!userId) return;
    const selected = users.find((u) => String(u.id) === String(userId));
    if (!selected) return;

    setEmail((prev) => (prev ? prev : selected.email || ""));
  }, [userId, users]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name,
      email,
      commission: Number(commission),
      userId,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        {/* Photo upload
            - In "New Master": initially masterId is undefined -> uploader hidden
            - After create: we auto-open Edit modal, uploader becomes available
        */}
        {masterId && (
          <div className="form-group">
            <label>Photo</label>
            <PhotoUpload
              entity="masters"
              id={masterId}
              token={token}
              currentUrl={photoUrl}
              onUploaded={(newUrl) => onPhotoUploaded?.(newUrl)}
            />
          </div>
        )}

        {/* Optional UX hint for create modal */}
        {!masterId && submitLabel === "Create" && (
          <p style={{ margin: "0 0 12px 0", color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
            You can upload a photo after creating the master.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Master Name *</label>
            <input
              type="text"
              placeholder="e.g., Anna Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="e.g., anna@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Commission % *</label>
            <input
              type="number"
              placeholder="e.g., 40"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              min="0"
              max="100"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>User *</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} required disabled={loading}>
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
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