import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPayments } from "../api/paymentsApi";
import { fetchClients, fetchAppointments, deletePayment } from "../api/api";
import "./Payments.css";
import CreatePaymentModal from "./components/CreatePaymentModal";
import EditPaymentModal from "./components/EditPaymentModal";

export default function Payments() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  
  const [payments, setPayments] = useState([]);
  const [partners, setPartners] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
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
  }, [token, activeTab]);

  const loadPayments = async (type) => {
    setLoading(true);
    try {
      const data = await getPayments(token, type === 'all' ? 'all' : type);
      const normalizedData = data.map(payment => ({
        ...payment,
        amount: typeof payment.amount === 'string' 
          ? parseFloat(payment.amount) 
          : payment.amount,
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
      setPartners(data);
    } catch (err) {
      console.error("Failed to load partners:", err);
    }
  };

  const loadAppointments = async () => {
    try {
      const data = await fetchAppointments(token);
      setAppointments(data);
    } catch (err) {
      console.error("Failed to load appointments:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePayment(token, id);

      setPayments(payments.filter(p => p.id !== id));
      setDeleteConfirm(null);
      setError("");
    } catch (err) {
      console.error("Failed to delete payment:", err);
      setError(err.message || "Failed to delete payment");
    }
  };

  const getPartnerInfo = (partnerId) => {
    const partner = partners.find(p => p.id === partnerId);
    return partner ? partner.name : "Unknown";
  };

  const getAppointmentInfo = (appointmentId) => {
    if (!appointmentId) return null;
    
    const apt = appointments.find(a => a.id === appointmentId);
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
    return payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2);
  };

  return (
    <div className="payments-container">
      <div className="payments-header">
        <h1>Payments</h1>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + New Payment
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="payments-tabs">
        <button
          className={`tab ${activeTab === "incoming" ? "active" : ""}`}
          onClick={() => setActiveTab("incoming")}
        >
          💰 Incoming
        </button>
        <button
          className={`tab ${activeTab === "outgoing" ? "active" : ""}`}
          onClick={() => setActiveTab("outgoing")}
        >
          📤 Outgoing
        </button>
        <button
          className={`tab ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          📊 All
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Payment?</h3>
            <p>This action cannot be undone.</p>
            <div className="confirm-actions">
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <th>Amount</th>
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
                          <span className={`partner-type badge-${payment.partner_type === 'customer' ? 'blue' : 'green'}`}>
                            {payment.partner_type === 'customer' ? 'Customer' : 'Vendor'}
                          </span>
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
                      <td className="cell-amount">${payment.amount.toFixed(2)}</td>
                      <td className="cell-method">
                        <span className={`badge ${getMethodBadgeColor(payment.method)}`}>
                          {payment.method}
                        </span>
                      </td>
                      <td className="cell-paid-at">
                        {formatDate(payment.paid_at)}
                      </td>
                      <td className="cell-actions">
                        <button
                          className="btn-icon"
                          title="Edit"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowEditModal(true);
                          }}

                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon btn-icon-danger"
                          title="Delete"
                          onClick={() => setDeleteConfirm(payment.id)}
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
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              Create First Payment
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreatePaymentModal
          onClose={() => setShowCreateModal(true)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadPayments(activeTab);
          }}
          partners={partners}
          appointments={appointments}
          token={token}
        />
      )}

      {showEditModal && selectedPayment && (
        <EditPaymentModal
          payment={selectedPayment}
          onClose={() => {
            setShowEditModal(false);
            setSelectedPayment(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedPayment(null);
            loadPayments(activeTab);
          }}
          partners={partners}
          appointments={appointments}
          token={token}
        />
      )}
    </div>
  );
}