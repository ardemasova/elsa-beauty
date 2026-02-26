import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanySettings, updateCompanySettings } from "../api/settingsApi";
import "./Settings.css";

export default function Settings() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  
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

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    } else {
      loadSettings();
    }
  }, [token]);

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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
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

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>⚙️ Settings</h1>
        <p>Manage your company information for invoices</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {loading ? (
        <div className="loading">Loading settings...</div>
      ) : (
        <form onSubmit={handleSubmit} className="settings-form">
          {/* Company Basic Info */}
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

          {/* Invoice Address */}
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

          {/* Bank Details */}
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

          {/* Actions */}
          <div className="settings-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={loadSettings}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}