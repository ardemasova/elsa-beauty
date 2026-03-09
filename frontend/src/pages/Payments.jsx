import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPayments, createPayment, updatePayment } from "../api/paymentsApi";
import { fetchClients, fetchAppointments, deletePayment } from "../api/api";
import "./Payments.css";
import * as XLSX from "xlsx";

export default function Payments() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [payments, setPayments] = useState([]);
  const [partners, setPartners] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Edit modal
  const [editingPayment, setEditingPayment] = useState(null);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("incoming");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    } else {
      loadPayments(activeTab);
      loadPartners();
      loadAppointments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTab]);

  const loadPayments = async (type) => {
    setLoading(true);
    try {
      const data = await getPayments(token, type === "all" ? "all" : type);
      const normalizedData = (Array.isArray(data) ? data : []).map((payment) => ({
        ...payment,
        amount: typeof payment.amount === "string" ? parseFloat(payment.amount) : payment.amount,
      }));
      setPayments(normalizedData);
      setError("");
    } catch (err) {
      console.error("Failed to load payments:", err);
      setError(err.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  const loadPartners = async () => {
    try {
      const data = await fetchClients(token);
      setPartners(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load partners:", err);
    }
  };

  const loadAppointments = async () => {
    try {
      const data = await fetchAppointments(token);
      setAppointments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load appointments:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePayment(token, id);
      setPayments(payments.filter((p) => p.id !== id));
      setDeleteConfirm(null);
      setError("");
    } catch (err) {
      console.error("Failed to delete payment:", err);
      setError(err.message || "Failed to delete payment");
    }
  };

  const getPartnerInfo = (partnerId) => {
    const partner = partners.find((p) => String(p.id) === String(partnerId));
    return partner ? partner.name : "Unknown";
  };

  const getPartnerType = (partnerId) => {
    const partner = partners.find((p) => String(p.id) === String(partnerId));
    return partner?.type || "";
  };

  const getAppointmentInfo = (appointmentId) => {
    if (!appointmentId) return null;

    const apt = appointments.find((a) => String(a.id) === String(appointmentId));
    if (!apt) return null;

    const appointmentDate = new Date(apt.start_time);
    const date = appointmentDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const time = appointmentDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return {
      date,
      time,
      master: apt.master_name || "Unknown",
    };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMethodBadgeColor = (method) => {
    switch (method) {
      case "card":
        return "badge-blue";
      case "cash":
        return "badge-green";
      default:
        return "badge-gray";
    }
  };

  const getTotalAmount = () => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0).toFixed(2);
  };

  // ======= Excel export (current tab payments only) =======
  const handleExportExcel = () => {
    const rows = payments.map((p) => {
      const aptInfo = getAppointmentInfo(p.appointment_id);

      return {
        ID: p.id,
        Type: activeTab,
        Partner: getPartnerInfo(p.partner_id),
        "Partner Type": p.partner_type || "",
        Appointment: aptInfo ? `${aptInfo.date} ${aptInfo.time}` : "",
        Master: aptInfo ? aptInfo.master : "",
        Amount: Number(p.amount || 0),
        Method: p.method || "",
        "Paid At": p.paid_at ? formatDate(p.paid_at) : "",
      };
    });

    const fileName = `payments_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, fileName);
  };

  // ======= Create / Update handlers (modal-driven, like Masters/Services) =======
  const handleCreate = async (values) => {
    setLoading(true);
    setError("");
    try {
      await createPayment(token, {
        ...values,
        amount: parseFloat(values.amount),
        appointment_id: values.appointment_id || null,
      });
      setShowCreateModal(false);
      await loadPayments(activeTab);
    } catch (err) {
      setError(err.message || "Failed to create payment");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, values) => {
    setLoading(true);
    setError("");
    try {
      await updatePayment(token, id, {
        ...values,
        amount: parseFloat(values.amount),
        appointment_id: values.appointment_id || null,
      });
      setEditingPayment(null);
      await loadPayments(activeTab);
    } catch (err) {
      setError(err.message || "Failed to update payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payments-container">
      <div className="payments-header">
        <h1>Invoices</h1>

        <div className="payments-header-actions">
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            + New Payment
          </button>

          <button className="btn-secondary" type="button" onClick={handleExportExcel} disabled={loading}>
            Export to Excel
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="payments-tabs">
        <button className={`tab ${activeTab === "incoming" ? "active" : ""}`} onClick={() => setActiveTab("incoming")}>
          💰 Incoming
        </button>
        <button className={`tab ${activeTab === "outgoing" ? "active" : ""}`} onClick={() => setActiveTab("outgoing")}>
          📤 Outgoing
        </button>
        <button className={`tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
          📊 All
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Payment?</h3>
            <p>This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={() => handleDelete(deleteConfirm)} disabled={loading}>
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="payments-table-wrapper">
        {loading ? (
          <div className="loading">Loading payments...</div>
        ) : payments.length > 0 ? (
          <>
            <table className="payments-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Appointment</th>
                  <th>Amount (VAT incl.)</th>
                  <th>Method</th>
                  <th>Paid At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const aptInfo = getAppointmentInfo(payment.appointment_id);
                  return (
                    <tr key={payment.id}>
                      <td className="cell-partner">
                        <div className="partner-info">
                          <span className="partner-name">{getPartnerInfo(payment.partner_id)}</span>

                        </div>
                      </td>

                      <td className="cell-appointment">
                        {aptInfo ? (
                          <div>
                            <div className="apt-date">{aptInfo.date}</div>
                            <div className="apt-time">{aptInfo.time}</div>
                            <div className="apt-master">{aptInfo.master}</div>
                          </div>
                        ) : (
                          <span className="no-appointment">-</span>
                        )}
                      </td>

                      <td className="cell-amount">${Number(payment.amount || 0).toFixed(2)}</td>

                      <td className="cell-method">
                        <span className={`badge ${getMethodBadgeColor(payment.method)}`}>{payment.method}</span>
                      </td>

                      <td className="cell-paid-at">{formatDate(payment.paid_at)}</td>

                      <td className="cell-actions">
                        <button
                          className="btn-icon"
                          title="Edit"
                          onClick={() => setEditingPayment(payment)}
                          disabled={loading}
                        >
                          ✏️
                        </button>

                        <button
                          className="btn-icon btn-icon-danger"
                          title="Delete"
                          onClick={() => setDeleteConfirm(payment.id)}
                          disabled={loading}
                        >
                          🗑️
                        </button>

                        <button
                          className="btn-icon"
                          title="View Invoice"
                          onClick={() => navigate(`/invoices/${payment.id}`)}
                        >
                          📄
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="payments-summary">
              <strong>Total {activeTab}: ${getTotalAmount()}</strong>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>No {activeTab} payments yet</p>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              Create First Payment
            </button>
          </div>
        )}
      </div>

      {/* Create (inline modal like Masters/Services) */}
      {showCreateModal && (
        <PaymentModal
          title="New Payment"
          loading={loading}
          partners={partners}
          appointments={appointments}
          initialValues={{
            partner_id: "",
            appointment_id: "",
            amount: "",
            method: "card",
            type: activeTab === "outgoing" ? "outgoing" : "incoming",
          }}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(values) => handleCreate(values)}
          submitLabel="Create"
          getPartnerType={getPartnerType}
        />
      )}

      {/* Edit (inline modal like Masters/Services) */}
      {editingPayment && (
        <PaymentModal
          title="Edit Payment"
          loading={loading}
          partners={partners}
          appointments={appointments}
          initialValues={{
            partner_id: editingPayment.partner_id ? String(editingPayment.partner_id) : "",
            appointment_id: editingPayment.appointment_id ? String(editingPayment.appointment_id) : "",
            amount: editingPayment.amount != null ? String(editingPayment.amount) : "",
            method: editingPayment.method || "card",
            type: editingPayment.type || activeTab,
          }}
          onClose={() => setEditingPayment(null)}
          onSubmit={(values) => handleUpdate(editingPayment.id, values)}
          submitLabel="Save"
          getPartnerType={getPartnerType}
        />
      )}
    </div>
  );
}

function PaymentModal({
  title,
  initialValues,
  partners,
  appointments,
  loading,
  onClose,
  onSubmit,
  submitLabel,
  getPartnerType,
}) {
  const [partnerId, setPartnerId] = useState(initialValues.partner_id);
  const [appointmentId, setAppointmentId] = useState(initialValues.appointment_id);
  const [amount, setAmount] = useState(initialValues.amount);
  const [method, setMethod] = useState(initialValues.method);
  const [type, setType] = useState(initialValues.type);

  useEffect(() => {
    setPartnerId(initialValues.partner_id);
    setAppointmentId(initialValues.appointment_id);
    setAmount(initialValues.amount);
    setMethod(initialValues.method);
    setType(initialValues.type);
  }, [initialValues]);

  // auto-set type based on partner type (same logic as your previous modal)
  useEffect(() => {
    if (!partnerId) return;
    const pt = getPartnerType(partnerId);
    if (!pt) return;
    setType(pt === "customer" ? "incoming" : "outgoing");
  }, [partnerId, getPartnerType]);

  const filteredAppointments = partnerId
    ? appointments.filter((apt) => String(apt.partner_id) === String(partnerId) || !apt.partner_id)
    : appointments;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      partner_id: partnerId,
      appointment_id: appointmentId,
      amount,
      method,
      type,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Partner *</label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required disabled={loading}>
              <option value="">Select a partner</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type === "customer" ? "Customer" : "Vendor"})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Payment Type</label>
            <select value={type} disabled className="disabled-field">
              <option value="incoming">Incoming (Customer)</option>
              <option value="outgoing">Outgoing (Vendor)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Appointment (Optional)</label>
            <select
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value)}
              disabled={loading || !partnerId}
            >
              <option value="">No appointment</option>
              {filteredAppointments.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  {apt.master_name} - {new Date(apt.start_time).toLocaleDateString()}{" "}
                  {new Date(apt.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Amount (VAT incl.)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Method *</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} required disabled={loading}>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="submit" disabled={loading || !partnerId}>
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