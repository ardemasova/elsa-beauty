import { useState, useEffect } from "react";
import { fetchClientsByType, createClient, updateClient, deleteClient } from "../api/api";
import PhotoUpload from "../components/PhotoUpload";
import { toAbsoluteUploadUrl } from "../api/uploadApi";
import * as XLSX from "xlsx";
import "./Clients.css";

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
        border: "2px solid rgba(0, 80, 103, 0.2)",
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
        border: "2px dashed rgba(0, 80, 103, 0.2)",
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

export default function Clients() {
  const [partners, setPartners] = useState([]);
  const [activeTab, setActiveTab] = useState("customer"); // customer, vendor, all
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("token");

  const [formData, setFormData] = useState({
    name: "",
    type: "customer",
    phone: "",
    email: "",
    address: "",
    vat_number: "",
    bank_name: "",
    bank_account: "",
    bank_code: "",
  });

  // keep current partner in state (for current photo_url)
  const [editingPartner, setEditingPartner] = useState(null);

  const resetForm = () => {
    setFormData({
      name: "",
      type: "customer",
      phone: "",
      email: "",
      address: "",
      vat_number: "",
      bank_name: "",
      bank_account: "",
      bank_code: "",
    });
  };

  const loadPartners = async () => {
    try {
      const type = activeTab === "all" ? null : activeTab;
      const data = await fetchClientsByType(token, type);
      setPartners(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // (optional debug)
  // useEffect(() => {
  //   if (partners.length) console.log("clients sample:", partners[0]);
  // }, [partners]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (editingId) {
        await updateClient(token, editingId, formData);
        setEditingId(null);
        setEditingPartner(null);

        setShowModal(false);
        resetForm();
        loadPartners();
      } else {
        const created = await createClient(token, formData);

        setShowModal(false);
        await loadPartners();

        if (created?.id) {
          setEditingId(created.id);
          setEditingPartner(created);
          setFormData({
            name: created.name ?? formData.name ?? "",
            type: created.type ?? formData.type ?? "customer",
            phone: created.phone ?? formData.phone ?? "",
            email: created.email ?? formData.email ?? "",
            address: created.address ?? formData.address ?? "",
            vat_number: created.vat_number ?? formData.vat_number ?? "",
            bank_name: created.bank_name ?? formData.bank_name ?? "",
            bank_account: created.bank_account ?? formData.bank_account ?? "",
            bank_code: created.bank_code ?? formData.bank_code ?? "",
          });
          setShowModal(true);
        } else {
          resetForm();
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (partner) => {
    setFormData({
      name: partner.name,
      type: partner.type,
      phone: partner.phone || "",
      email: partner.email || "",
      address: partner.address || "",
      vat_number: partner.vat_number || "",
      bank_name: partner.bank_name || "",
      bank_account: partner.bank_account || "",
      bank_code: partner.bank_code || "",
    });
    setEditingId(partner.id);
    setEditingPartner(partner);
    setShowModal(true);
  };

  const handleDeleteClick = (id) => setDeleteConfirmId(id);

  const handleConfirmDelete = async () => {
    setError("");
    setLoading(true);

    try {
      await deleteClient(token, deleteConfirmId);
      setDeleteConfirmId(null);
      loadPartners();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setEditingPartner(null);
    resetForm();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleExportExcel = () => {
    const rows = partners.map((p) => ({
      ID: p.id,
      Name: p.name,
      Type: p.type,
      Phone: p.phone || "",
      Email: p.email || "",
      Address: p.address || "",
      "VAT Number": p.vat_number || "",
      "Bank Name": p.bank_name || "",
      "Bank Account": p.bank_account || "",
      "Bank Code": p.bank_code || "",
      Photo: p.photo_url || "",
      Created: p.created_at ? formatDate(p.created_at) : "",
    }));

    const fileName = `partners_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Partners");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="partners-container">
      <div className="partners-header">
        <h1>Business Partners</h1>

        <div className="partners-header-actions">
          <button
            className="btn-primary"
            onClick={() => {
              setEditingId(null);
              setEditingPartner(null);
              resetForm();
              setShowModal(true);
            }}
          >
            + New Partner
          </button>

          <button
            className="btn-secondary"
            type="button"
            onClick={handleExportExcel}
            disabled={loading}
            title="Exports current tab partners"
          >
            Export to Excel
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Tabs */}
      <div className="partners-tabs">
        <button className={`tab ${activeTab === "customer" ? "active" : ""}`} onClick={() => setActiveTab("customer")}>
          👥 Customers
        </button>
        <button className={`tab ${activeTab === "vendor" ? "active" : ""}`} onClick={() => setActiveTab("vendor")}>
          🏭 Vendors
        </button>
        <button className={`tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
          📋 All
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit Partner" : "New Partner"}</h2>

            {/* Photo upload (only in Edit mode, because we need id) */}
            {editingId && (
              <div className="form-group">
                <label>Photo</label>
                <PhotoUpload
                  entity="clients"
                  id={editingId}
                  token={token}
                  currentUrl={editingPartner?.photo_url || ""}
                  onUploaded={(newUrl) => {
                   if (!newUrl) return;

  // 1) обновляем состояние текущего партнера (в модалке)
  setEditingPartner((prev) => ({ ...(prev || {}), photo_url: newUrl }));

  // 2) сразу обновляем строку в таблице, чтобы img начал грузить НОВЫЙ файл
  setPartners((prev) =>
    prev.map((p) => (String(p.id) === String(editingId) ? { ...p, photo_url: newUrl } : p))
  );

  // 3) и затем подтягиваем с сервера (но UI уже правильный)
  loadPartners();
}}
                />
              </div>
            )}

            {!editingId && (
              <p style={{ margin: "0 0 12px 0", color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
                You can upload a photo after creating the partner.
              </p>
            )}

            <form onSubmit={handleSubmit}>
              {/* Basic Info */}
              <fieldset>
                <legend>Basic Information</legend>

                <div className="form-group">
                  <label>Partner Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Type *</label>
                    <select name="type" value={formData.type} onChange={handleInputChange} required disabled={loading}>
                      <option value="customer">Customer</option>
                      <option value="vendor">Vendor</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Phone</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} disabled={loading} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} disabled={loading} />
                </div>
              </fieldset>

              {/* Invoice Address */}
              <fieldset>
                <legend>Invoice Address</legend>

                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Street, City, Postal Code"
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label>VAT Number</label>
                  <input
                    type="text"
                    name="vat_number"
                    value={formData.vat_number}
                    onChange={handleInputChange}
                    placeholder="e.g., DE123456789"
                    disabled={loading}
                  />
                </div>
              </fieldset>

              {/* Bank Details */}
              <fieldset>
                <legend>Bank Details</legend>

                <div className="form-group">
                  <label>Bank Name</label>
                  <input type="text" name="bank_name" value={formData.bank_name} onChange={handleInputChange} disabled={loading} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Account Number</label>
                    <input
                      type="text"
                      name="bank_account"
                      value={formData.bank_account}
                      onChange={handleInputChange}
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label>Bank Code (SWIFT/BIC)</label>
                    <input type="text" name="bank_code" value={formData.bank_code} onChange={handleInputChange} disabled={loading} />
                  </div>
                </div>
              </fieldset>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Saving..." : editingId ? "Save Partner" : "Create Partner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Partner?</h3>
            <p>This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleConfirmDelete} disabled={loading}>
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="partners-table-wrapper">
        {partners.length > 0 ? (
          <table className="partners-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}></th>
                <th>Name</th>
                <th>Type</th>
                <th>Phone</th>
                <th>Email</th>
                <th>VAT</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id}>
                  <td>
                    <AvatarCell url={partner.photo_url} alt={`${partner.name} photo`} />
                  </td>

                  <td className="cell-name">{partner.name}</td>
                  <td className="cell-type">
                    <span className={`badge badge-${partner.type === "customer" ? "blue" : "green"}`}>
                      {partner.type === "customer" ? "👥 Customer" : "🏭 Vendor"}
                    </span>
                  </td>
                  <td>{partner.phone || "-"}</td>
                  <td>{partner.email || "-"}</td>
                  <td>{partner.vat_number || "-"}</td>
                  <td className="cell-date">{formatDate(partner.created_at)}</td>
                  <td className="cell-actions">
                    <button className="btn-icon" title="Edit" onClick={() => handleEditClick(partner)} disabled={loading}>
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      title="Delete"
                      onClick={() => handleDeleteClick(partner.id)}
                      disabled={loading}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>No {activeTab === "all" ? "partners" : `${activeTab}s`} yet</p>
            <button
              className="btn-primary"
              onClick={() => {
                setEditingId(null);
                setEditingPartner(null);
                resetForm();
                setShowModal(true);
              }}
            >
              Create First Partner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}