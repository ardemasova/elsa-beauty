import { useState, useEffect } from "react";
import { fetchClients, createClient, updateClient, deleteClient } from "../api/api";
import "./Clients.css";

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

  const loadPartners = async () => {
    try {
      const type = activeTab === 'all' ? null : activeTab;
      const query = type ? `?type=${type}` : '';
      const response = await fetch(`/api/clients${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load partners");
      const data = await response.json();
      setPartners(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadPartners();
  }, [activeTab]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
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
      } else {
        await createClient(token, formData);
      }

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

      setShowModal(false);
      loadPartners();
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
    setShowModal(true);
  };

  const handleDeleteClick = (id) => {
    setDeleteConfirmId(id);
  };

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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getTypeBadge = (type) => {
    return type === 'customer' 
      ? '<span class="badge badge-blue">Customer</span>'
      : '<span class="badge badge-green">Vendor</span>';
  };

  return (
    <div className="partners-container">
      <div className="partners-header">
        <h1>Business Partners</h1>
        <button
          className="btn-primary"
          onClick={() => setShowModal(true)}
        >
          + New Partner
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Tabs */}
      <div className="partners-tabs">
        <button
          className={`tab ${activeTab === "customer" ? "active" : ""}`}
          onClick={() => setActiveTab("customer")}
        >
          👥 Customers
        </button>
        <button
          className={`tab ${activeTab === "vendor" ? "active" : ""}`}
          onClick={() => setActiveTab("vendor")}
        >
          🏭 Vendors
        </button>
        <button
          className={`tab ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          📋 All
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit Partner" : "New Partner"}</h2>

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
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      required
                      disabled={loading}
                    >
                      <option value="customer">Customer</option>
                      <option value="vendor">Vendor</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={loading}
                  />
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
                  <input
                    type="text"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleInputChange}
                    disabled={loading}
                  />
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
                    <input
                      type="text"
                      name="bank_code"
                      value={formData.bank_code}
                      onChange={handleInputChange}
                      disabled={loading}
                    />
                  </div>
                </div>
              </fieldset>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Partner"}
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
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleConfirmDelete}
                disabled={loading}
              >
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
              {partners.map(partner => (
                <tr key={partner.id}>
                  <td className="cell-name">{partner.name}</td>
                  <td className="cell-type">
                    <span className={`badge badge-${partner.type === 'customer' ? 'blue' : 'green'}`}>
                      {partner.type === 'customer' ? '👥 Customer' : '🏭 Vendor'}
                    </span>
                  </td>
                  <td>{partner.phone || '-'}</td>
                  <td>{partner.email || '-'}</td>
                  <td>{partner.vat_number || '-'}</td>
                  <td className="cell-date">{formatDate(partner.created_at)}</td>
                  <td className="cell-actions">
                    <button
                      className="btn-icon"
                      title="Edit"
                      onClick={() => handleEditClick(partner)}
                      disabled={loading}
                    >
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
            <p>No {activeTab === 'all' ? 'partners' : `${activeTab}s`} yet</p>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              Create First Partner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}