import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanySettings, updateCompanySettings } from "../api/settingsApi";
import { fetchTenants, createTenant, updateTenant, deleteTenant } from "../api/tenantsApi";
import "./Settings.css";

/**
 * VAT API (inline to avoid extra files)
 * Backend endpoints:
 *  GET    /api/vat
 *  POST   /api/vat
 *  PUT    /api/vat/:id
 *  PATCH  /api/vat/:id/default
 *  DELETE /api/vat/:id
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

async function vatFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `VAT request failed (${res.status})`);
  return data;
}

export default function Settings() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [activeTab, setActiveTab] = useState("company"); // company | branches | vat

  // Company info
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    company_name: "",
    company_address: "",
    company_vat_number: "",
    company_bank_name: "",
    company_bank_account: "",
    company_bank_code: "",
    company_email: "",
    company_phone: "",
    company_website: "",
  });

  // Branches
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState("");

  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Admin UI gating: backend enforces admin anyway; this just hides buttons
  const [isAdmin, setIsAdmin] = useState(false);

  // VAT
  const [vatRates, setVatRates] = useState([]);
  const [vatLoading, setVatLoading] = useState(false);
  const [vatError, setVatError] = useState("");
  const [showCreateVatModal, setShowCreateVatModal] = useState(false);

  // VAT delete confirm
  const [vatDeleteConfirmId, setVatDeleteConfirmId] = useState(null);

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    // best-effort: parse JWT to read role (no signature verify)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setIsAdmin(payload?.role === "admin");
    } catch {
      setIsAdmin(false);
    }

    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;

    if (activeTab === "branches") loadBranches();
    if (activeTab === "vat") loadVatRates();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getCompanySettings(token);
      setFormData({
        company_name: data.company_name || "",
        company_address: data.company_address || "",
        company_vat_number: data.company_vat_number || "",
        company_bank_name: data.company_bank_name || "",
        company_bank_account: data.company_bank_account || "",
        company_bank_code: data.company_bank_code || "",
        company_email: data.company_email || "",
        company_phone: data.company_phone || "",
        company_website: data.company_website || "",
      });
      setError("");
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async () => {
    setBranchesLoading(true);
    setBranchesError("");
    try {
      const data = await fetchTenants(token);
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load branches:", err);
      setBranchesError(err.message || "Failed to load branches");
    } finally {
      setBranchesLoading(false);
    }
  };

  // VAT load + actions
  const loadVatRates = async () => {
    setVatLoading(true);
    setVatError("");
    try {
      const data = await vatFetch("/vat", token);
      setVatRates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load VAT rates:", err);
      setVatError(err.message || "Failed to load VAT rates");
    } finally {
      setVatLoading(false);
    }
  };

  const handleCreateVat = async ({ percent, is_default }) => {
    setVatLoading(true);
    setVatError("");
    try {
      await vatFetch("/vat", token, {
        method: "POST",
        body: JSON.stringify({ percent, is_default }),
      });
      setShowCreateVatModal(false);
      await loadVatRates();
    } catch (err) {
      setVatError(err.message || "Failed to create VAT rate");
    } finally {
      setVatLoading(false);
    }
  };

  const handleSetDefaultVat = async (rate) => {
    if (!rate?.id) return;
    setVatLoading(true);
    setVatError("");
    try {
      await vatFetch(`/vat/${rate.id}/default`, token, { method: "PATCH" });
      await loadVatRates();
    } catch (err) {
      setVatError(err.message || "Failed to set default VAT");
    } finally {
      setVatLoading(false);
    }
  };

  const handleDeleteVat = async (id) => {
    if (!id) return;
    setVatLoading(true);
    setVatError("");
    try {
      await vatFetch(`/vat/${id}`, token, { method: "DELETE" });
      setVatDeleteConfirmId(null);
      await loadVatRates();
    } catch (err) {
      setVatError(err.message || "Failed to delete VAT");
    } finally {
      setVatLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitCompany = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await updateCompanySettings(token, formData);
      setSuccess("Company settings updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  // Branch CRUD
  const handleCreateBranch = async (values) => {
    setBranchesError("");
    setBranchesLoading(true);
    try {
      await createTenant(token, values);
      setShowCreateBranchModal(false);
      await loadBranches();
    } catch (err) {
      setBranchesError(err.message || "Failed to create branch");
    } finally {
      setBranchesLoading(false);
    }
  };

  const handleUpdateBranch = async (id, values) => {
    setBranchesError("");
    setBranchesLoading(true);
    try {
      await updateTenant(token, id, values);
      setEditingBranch(null);
      await loadBranches();
    } catch (err) {
      setBranchesError(err.message || "Failed to update branch");
    } finally {
      setBranchesLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setBranchesError("");
    setBranchesLoading(true);
    try {
      await deleteTenant(token, deleteConfirmId);
      setDeleteConfirmId(null);
      await loadBranches();
    } catch (err) {
      setBranchesError(err.message || "Failed to delete branch");
    } finally {
      setBranchesLoading(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h1>Settings</h1>
          <p>Manage your company information and branches</p>
        </div>

        <div className="settings-tabs">
          <button
            type="button"
            className={`tab ${activeTab === "company" ? "active" : ""}`}
            onClick={() => setActiveTab("company")}
          >
            🏢 <span className="tab-label">Company Info</span>
          </button>

          <button
            type="button"
            className={`tab ${activeTab === "branches" ? "active" : ""}`}
            onClick={() => setActiveTab("branches")}
          >
            🏬 <span className="tab-label">Branches</span>
          </button>

          <button
            type="button"
            className={`tab ${activeTab === "vat" ? "active" : ""}`}
            onClick={() => setActiveTab("vat")}
          >
            🧾 <span className="tab-label">VAT</span>
          </button>
        </div>

        {activeTab === "company" && (
          <>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            {loading ? (
              <div className="loading">Loading settings...</div>
            ) : (
              <form onSubmit={handleSubmitCompany} className="settings-form">
                <section className="settings-section">
                  <h2>Company Information</h2>

                  <div className="form-group">
                    <label>Company Name</label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      placeholder="e.g., Elsa Beauty Salon"
                      disabled={saving}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        name="company_email"
                        value={formData.company_email}
                        onChange={handleInputChange}
                        placeholder="contact@example.com"
                        disabled={saving}
                      />
                    </div>

                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        name="company_phone"
                        value={formData.company_phone}
                        onChange={handleInputChange}
                        placeholder="+1 (555) 000-0000"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Website</label>
                    <input
                      type="url"
                      name="company_website"
                      value={formData.company_website}
                      onChange={handleInputChange}
                      placeholder="https://example.com"
                      disabled={saving}
                    />
                  </div>
                </section>

                <section className="settings-section">
                  <h2>Invoice Address</h2>

                  <div className="form-group">
                    <label>Address</label>
                    <textarea
                      name="company_address"
                      value={formData.company_address}
                      onChange={handleInputChange}
                      rows="4"
                      placeholder="Street, City, Postal Code"
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group">
                    <label>VAT Number</label>
                    <input
                      type="text"
                      name="company_vat_number"
                      value={formData.company_vat_number}
                      onChange={handleInputChange}
                      placeholder="e.g., DE123456789"
                      disabled={saving}
                    />
                  </div>
                </section>

                <section className="settings-section">
                  <h2>Bank Details</h2>

                  <div className="form-group">
                    <label>Bank Name</label>
                    <input
                      type="text"
                      name="company_bank_name"
                      value={formData.company_bank_name}
                      onChange={handleInputChange}
                      placeholder="e.g., Deutsche Bank"
                      disabled={saving}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Account Number / IBAN</label>
                      <input
                        type="text"
                        name="company_bank_account"
                        value={formData.company_bank_account}
                        onChange={handleInputChange}
                        placeholder="Account number"
                        disabled={saving}
                      />
                    </div>

                    <div className="form-group">
                      <label>Bank Code / SWIFT</label>
                      <input
                        type="text"
                        name="company_bank_code"
                        value={formData.company_bank_code}
                        onChange={handleInputChange}
                        placeholder="Bank code"
                        disabled={saving}
                      />
                    </div>
                  </div>
                </section>

                <div className="settings-actions">
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={loadSettings} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {activeTab === "branches" && (
          <div className="settings-branches">
            {branchesError && <div className="error-message">{branchesError}</div>}

            <div className="settings-branches-header">
              <h2>Branches</h2>

              {isAdmin && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowCreateBranchModal(true)}
                  disabled={branchesLoading}
                >
                  + New Branch
                </button>
              )}
            </div>

            {!isAdmin && <div className="info-message">You can view branches, but only an admin can create or edit tenants.</div>}

            <section className="settings-section">
              {branchesLoading ? (
                <div className="loading">Loading branches...</div>
              ) : (
                <div className="card">
                  <table className="branches-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Schema</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.length > 0 ? (
                        branches.map((b) => (
                          <tr key={b.id}>
                            <td>{b.name}</td>
                            <td>
                              <code>{b.schema_name}</code>
                            </td>
                            <td>
                              <span className={`status-pill ${b.is_active ? "active" : "inactive"}`}>
                                {b.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>{b.created_at ? new Date(b.created_at).toLocaleString() : "-"}</td>
                            <td className="actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setEditingBranch(b)}
                                disabled={branchesLoading || !isAdmin}
                                title={!isAdmin ? "Admin only" : "Edit"}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => setDeleteConfirmId(b.id)}
                                disabled={branchesLoading || !isAdmin}
                                title={!isAdmin ? "Admin only" : "Delete"}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: "center", color: "#9ca3af", fontWeight: 700 }}>
                            No branches yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {showCreateBranchModal && (
              <BranchModal
                title="New Branch"
                loading={branchesLoading}
                initialValues={{ name: "", schema_name: "", is_active: true }}
                onClose={() => setShowCreateBranchModal(false)}
                onSubmit={handleCreateBranch}
                submitLabel="Create"
              />
            )}

            {editingBranch && (
              <BranchModal
                title="Edit Branch"
                loading={branchesLoading}
                initialValues={{
                  name: editingBranch.name || "",
                  schema_name: editingBranch.schema_name || "",
                  is_active: Boolean(editingBranch.is_active),
                }}
                onClose={() => setEditingBranch(null)}
                onSubmit={(values) => handleUpdateBranch(editingBranch.id, values)}
                submitLabel="Save"
              />
            )}

            {deleteConfirmId && (
              <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
                <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
                  <h3>Delete Branch</h3>
                  <p>Are you sure you want to delete this branch? This action cannot be undone.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={handleConfirmDelete} disabled={branchesLoading}>
                      {branchesLoading ? "Deleting..." : "Delete"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmId(null)} disabled={branchesLoading}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "vat" && (
          <div className="settings-branches">
            {vatError && <div className="error-message">{vatError}</div>}

            <div className="settings-branches-header">
              <h2>VAT Rates</h2>

              {isAdmin && (
                <button type="button" className="btn-primary" onClick={() => setShowCreateVatModal(true)} disabled={vatLoading}>
                  + New VAT
                </button>
              )}
            </div>

            {!isAdmin && <div className="info-message">You can view VAT rates, but only an admin can create or edit them.</div>}

            <section className="settings-section">
              {vatLoading ? (
                <div className="loading">Loading VAT...</div>
              ) : (
                <div className="card">
                  <table className="branches-table">
                    <thead>
                      <tr>
                        <th>Percent</th>
                        <th>Default</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatRates.length > 0 ? (
                        vatRates.map((r) => (
                          <tr key={r.id}>
                            <td>{r.percent}%</td>
                            <td>{r.is_default === "Y" ? "✅" : ""}</td>
                            <td className="actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => handleSetDefaultVat(r)}
                                disabled={vatLoading || !isAdmin || r.is_default === "Y"}
                                title={!isAdmin ? "Admin only" : r.is_default === "Y" ? "Already default" : "Set as default"}
                              >
                                Set default
                              </button>

                              <button
                                type="button"
                                className="btn-danger"
                                onClick={() => setVatDeleteConfirmId(r.id)}
                                disabled={vatLoading || !isAdmin || r.is_default === "Y"}
                                title={
                                  r.is_default === "Y"
                                    ? "Cannot delete default. Set another default first."
                                    : !isAdmin
                                      ? "Admin only"
                                      : "Delete"
                                }
                                style={{ marginLeft: 8 }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" style={{ textAlign: "center", color: "#9ca3af", fontWeight: 700 }}>
                            No VAT rates yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {showCreateVatModal && (
              <VatModal
                title="New VAT rate"
                loading={vatLoading}
                initialValues={{ percent: "", is_default: vatRates.length === 0 ? "Y" : "N" }}
                onClose={() => setShowCreateVatModal(false)}
                onSubmit={handleCreateVat}
                submitLabel="Create"
              />
            )}

            {vatDeleteConfirmId && (
              <div className="modal-overlay" onClick={() => setVatDeleteConfirmId(null)}>
                <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
                  <h3>Delete VAT rate</h3>
                  <p>Are you sure you want to delete this VAT rate? This action cannot be undone.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={() => handleDeleteVat(vatDeleteConfirmId)} disabled={vatLoading}>
                      {vatLoading ? "Deleting..." : "Delete"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setVatDeleteConfirmId(null)} disabled={vatLoading}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchModal({ title, initialValues, loading, onClose, onSubmit, submitLabel }) {
  const [name, setName] = useState(initialValues.name);
  const [schemaName, setSchemaName] = useState(initialValues.schema_name);
  const [isActive, setIsActive] = useState(initialValues.is_active);

  useEffect(() => {
    setName(initialValues.name);
    setSchemaName(initialValues.schema_name);
    setIsActive(initialValues.is_active);
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name,
      schema_name: schemaName,
      is_active: isActive,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Branch Name *</label>
            <input
              type="text"
              placeholder="e.g., Downtown Branch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Schema Name *</label>
            <input
              type="text"
              placeholder="e.g., tenant_downtown"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
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
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Saving..." : submitLabel}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VatModal({ title, initialValues, loading, onClose, onSubmit, submitLabel }) {
  const [percent, setPercent] = useState(initialValues.percent);
  const [isDefault, setIsDefault] = useState(initialValues.is_default || "N");

  useEffect(() => {
    setPercent(initialValues.percent);
    setIsDefault(initialValues.is_default || "N");
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const num = Number(percent);
    if (Number.isNaN(num) || num < 0 || num > 100) return;

    onSubmit({
      percent: num,
      is_default: isDefault,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Percent *</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Default</label>
            <select value={isDefault} onChange={(e) => setIsDefault(e.target.value)} disabled={loading}>
              <option value="N">No</option>
              <option value="Y">Yes</option>
            </select>
            <p style={{ marginTop: 8, color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
              Only one VAT rate can be default. If you set this to Yes, the system will unset the previous default.
            </p>
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Saving..." : submitLabel}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}