import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getPayments, createPayment, updatePayment } from "../api/paymentsApi";
import { fetchClients, fetchAppointments, fetchItems, fetchServices, fetchExpenses, deletePayment } from "../api/api";
import "./Payments.css";
import * as XLSX from "xlsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// VAT API helper (same as Settings)
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

export default function Payments() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [payments, setPayments] = useState([]);
  const [partners, setPartners] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [items, setItems] = useState([]);
  const [services, setServices] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // ✅ NEW: VAT
  const [vatRates, setVatRates] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
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
      loadItems();
      loadServices();
      loadVatRates(); // ✅ NEW
      if (activeTab === "outgoing") loadExpenses(); // Только для исходящих платежей
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTab]);

  const loadVatRates = async () => {
    try {
      const data = await vatFetch("/vat", token);
      setVatRates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load VAT rates:", err);
    }
  };

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

  const loadItems = async () => {
    try {
      const data = await fetchItems(token);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load items:", err);
    }
  };

  const loadServices = async () => {
    try {
      const data = await fetchServices(token);
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load services:", err);
    }
  };

  const loadExpenses = async () => {
    try {
      const data = await fetchExpenses(token);
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load expenses:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePayment(token, id);
      setPayments((prev) => prev.filter((p) => p.id !== id));
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

  const getItemInfo = (itemId) => {
    const item = items.find((i) => String(i.id) === String(itemId));
    return item ? item.name : "Unknown";
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

  // NEW: Expenses info
  const getExpenseInfo = (expenseId) => {
    const exp = expenses.find((e) => String(e.id) === String(expenseId));
    return exp ? exp.name : "";
  };

  // derive appointment price from its service.price
  const getAppointmentPrice = (appointmentId) => {
    if (!appointmentId) return null;

    const apt = appointments.find((a) => String(a.id) === String(appointmentId));
    if (!apt?.service_id) return null;

    const svc = services.find((s) => String(s.id) === String(apt.service_id));
    if (!svc) return null;

    const price = svc.price;
    if (price == null) return null;

    return typeof price === "string" ? parseFloat(price) : Number(price);
  };

  // ✅ NEW: default VAT (percent) helper
  const getDefaultVatPercent = () => {
    const def = vatRates.find((v) => v.is_default === "Y");
    return def?.percent ?? "";
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

  const getTotalAmount = () => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0).toFixed(2);

  // Excel export (current tab payments only)
  const handleExportExcel = () => {
    const rows = payments.map((p) => {
      let paidFor = "";
      if (p.appointment_id) {
        const aptInfo = getAppointmentInfo(p.appointment_id);
        paidFor = aptInfo ? `${aptInfo.date} ${aptInfo.time}` : String(p.appointment_id);
      } else if (p.item_id) {
        paidFor = getItemInfo(p.item_id);
      } else if (p.expense_id) {
        paidFor = getExpenseInfo(p.expense_id);
      }

      return {
        ID: p.id,
        Type: activeTab,
        Partner: getPartnerInfo(p.partner_id),
        "Partner Type": p.partner_type || "",
        "Paid For": paidFor,
        Master: p.appointment_id ? (getAppointmentInfo(p.appointment_id)?.master || "") : "",
        Qty: p.qty ?? p.quantity ?? "",
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

  const handleCreate = async (values) => {
    setLoading(true);
    setError("");
    const hasAppointment = Boolean(values.appointment_id);
    const hasItem = Boolean(values.item_id);
    const hasExpense = Boolean(values.expense_id);

    // Для исходящих платежей: appointment/item/expense, для входящих: appointment/item
    if (
      (!hasAppointment && !hasItem && !hasExpense) ||
      ((hasAppointment && hasItem) || (hasAppointment && hasExpense) || (hasItem && hasExpense))
    ) {
      setLoading(false);
      setError(
        activeTab === "outgoing"
          ? "Please select either an Appointment, Item, or Expense."
          : "Please select either an Appointment or an Item."
      );
      return;
    }

    try {
      await createPayment(token, {
        ...values,
        amount: parseFloat(values.amount),
        vat_percent: values.vat_percent === "" ? null : Number(values.vat_percent),
        appointment_id: values.appointment_id || null,
        item_id: values.item_id || null,
        expense_id: values.expense_id || null,
        qty: values.appointment_id ? 1 : Number(values.qty || 1),
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
    const hasAppointment = Boolean(values.appointment_id);
    const hasItem = Boolean(values.item_id);
    const hasExpense = Boolean(values.expense_id);

    if (
      (!hasAppointment && !hasItem && !hasExpense) ||
      ((hasAppointment && hasItem) || (hasAppointment && hasExpense) || (hasItem && hasExpense))
    ) {
      setLoading(false);
      setError(
        activeTab === "outgoing"
          ? "Please select either an Appointment, Item, or Expense."
          : "Please select either an Appointment or an Item."
      );
      return;
    }

    try {
      await updatePayment(token, id, {
        ...values,
        amount: parseFloat(values.amount),
        vat_percent: values.vat_percent === "" ? null : Number(values.vat_percent),
        appointment_id: values.appointment_id || null,
        item_id: values.item_id || null,
        expense_id: values.expense_id || null,
        qty: values.appointment_id ? 1 : Number(values.qty || 1),
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
                  <th>Paid For</th>
                  <th>Qty</th>
                  <th>Amount (VAT incl.)</th>
                  <th>VAT</th>
                  <th>Method</th>
                  <th>Paid At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  let paidFor = "";
                  let master = "";
                  if (payment.appointment_id) {
                    const aptInfo = getAppointmentInfo(payment.appointment_id);
                    paidFor = aptInfo ? `${aptInfo.date} ${aptInfo.time}` : String(payment.appointment_id);
                    master = aptInfo ? aptInfo.master : "";
                  } else if (payment.item_id) {
                    paidFor = getItemInfo(payment.item_id);
                  } else if (payment.expense_id) {
                    paidFor = getExpenseInfo(payment.expense_id);
                  }

                  const qtyVal = payment.qty ?? payment.quantity ?? 1;

                  return (
                    <tr key={payment.id}>
                      <td className="cell-partner">
                        <div className="partner-info">
                          <span className="partner-name">{getPartnerInfo(payment.partner_id)}</span>
                        </div>
                      </td>
                      <td className="cell-paid-for">{paidFor}</td>
                      <td className="cell-qty">{qtyVal}</td>
                      <td className="cell-amount">${Number(payment.amount || 0).toFixed(2)}</td>
                      <td className="cell-vat">{payment.vat_percent != null ? `${Number(payment.vat_percent)}%` : "-"}</td>
                      <td className="cell-method">
                        <span className={`badge ${getMethodBadgeColor(payment.method)}`}>{payment.method}</span>
                      </td>
                      <td className="cell-paid-at">{formatDate(payment.paid_at)}</td>
                      <td className="cell-actions">
                        <button className="btn-icon" title="Edit" onClick={() => setEditingPayment(payment)} disabled={loading}>
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
                        <button className="btn-icon" title="View Invoice" onClick={() => navigate(`/invoices/${payment.id}`)}>
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

      {/* Create */}
      {showCreateModal && (
        <PaymentModal
          title="New Payment"
          loading={loading}
          partners={partners}
          appointments={appointments}
          items={items}
          expenses={activeTab === "outgoing" ? expenses : []} // отправляем расходы только для исходящих
          vatRates={vatRates}
          defaultVatPercent={getDefaultVatPercent()}
          activeTab={activeTab}
          initialValues={{
            partner_id: "",
            link_type: "appointment",
            appointment_id: "",
            item_id: "",
            expense_id: "",
            qty: 1,
            amount: "",
            vat_percent: String(getDefaultVatPercent() ?? ""),
            method: "card",
            type: activeTab === "outgoing" ? "outgoing" : "incoming",
          }}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(values) => handleCreate(values)}
          submitLabel="Create"
          getPartnerType={getPartnerType}
          getAppointmentPrice={getAppointmentPrice}
        />
      )}

      {/* Edit */}
      {editingPayment && (
        <PaymentModal
          title="Edit Payment"
          loading={loading}
          partners={partners}
          appointments={appointments}
          items={items}
          expenses={activeTab === "outgoing" ? expenses : []}
          vatRates={vatRates}
          defaultVatPercent={getDefaultVatPercent()}
          activeTab={activeTab}
          initialValues={{
            partner_id: editingPayment.partner_id ? String(editingPayment.partner_id) : "",
            link_type:
              editingPayment.expense_id
                ? "expense"
                : editingPayment.item_id
                ? "item"
                : "appointment",
            appointment_id: editingPayment.appointment_id ? String(editingPayment.appointment_id) : "",
            item_id: editingPayment.item_id ? String(editingPayment.item_id) : "",
            expense_id: editingPayment.expense_id ? String(editingPayment.expense_id) : "",
            qty: editingPayment.qty ?? editingPayment.quantity ?? 1,
            amount: editingPayment.amount != null ? String(editingPayment.amount) : "",
            vat_percent:
              editingPayment.vat_percent != null
                ? String(editingPayment.vat_percent)
                : String(getDefaultVatPercent() ?? ""),
            method: editingPayment.method || "card",
            type: editingPayment.type || activeTab,
          }}
          onClose={() => setEditingPayment(null)}
          onSubmit={(values) => handleUpdate(editingPayment.id, values)}
          submitLabel="Save"
          getPartnerType={getPartnerType}
          getAppointmentPrice={getAppointmentPrice}
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
  items,
  expenses,
  vatRates,
  defaultVatPercent,
  loading,
  onClose,
  onSubmit,
  submitLabel,
  getPartnerType,
  activeTab,
  getAppointmentPrice,
}) {
  const [partnerId, setPartnerId] = useState(initialValues.partner_id);
  const [linkType, setLinkType] = useState(initialValues.link_type || "appointment");
  const [appointmentId, setAppointmentId] = useState(initialValues.appointment_id);
  const [itemId, setItemId] = useState(initialValues.item_id);
  const [expenseId, setExpenseId] = useState(initialValues.expense_id);
  const [qty, setQty] = useState(initialValues.qty ?? 1);
  const [amount, setAmount] = useState(initialValues.amount);
  const [vatPercent, setVatPercent] = useState(initialValues.vat_percent ?? "");
  const [method, setMethod] = useState(initialValues.method);
  const [type, setType] = useState(initialValues.type);
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => {
    setPartnerId(initialValues.partner_id);
    setLinkType(initialValues.link_type || "appointment");
    setAppointmentId(initialValues.appointment_id);
    setItemId(initialValues.item_id);
    setExpenseId(initialValues.expense_id);
    setQty(initialValues.qty ?? 1);
    setAmount(initialValues.amount);
    setVatPercent(
      initialValues.vat_percent !== undefined && initialValues.vat_percent !== null && initialValues.vat_percent !== ""
        ? String(initialValues.vat_percent)
        : String(defaultVatPercent ?? "")
    );
    setMethod(initialValues.method);
    setType(initialValues.type);
    setAmountTouched(false);
  }, [initialValues, defaultVatPercent]);

  const filteredPartners = useMemo(() => {
    if (activeTab === "incoming") return partners.filter((p) => p.type === "customer");
    if (activeTab === "outgoing") return partners.filter((p) => p.type === "vendor");
    return partners;
  }, [partners, activeTab]);

  useEffect(() => {
    if (!partnerId) return;
    const pt = getPartnerType(partnerId);
    if (!pt) return;
    setType(pt === "customer" ? "incoming" : "outgoing");
  }, [partnerId, getPartnerType]);

  useEffect(() => {
    setAppointmentId("");
    setItemId("");
    setExpenseId("");
    setQty(1);
    setAmountTouched(false);
  }, [partnerId]);

  useEffect(() => {
    if (linkType === "appointment") {
      setItemId("");
      setExpenseId("");
      setQty(1);
    } else if (linkType === "item") {
      setAppointmentId("");
      setExpenseId("");
      setQty((q) => (q && Number(q) > 0 ? q : 1));
    } else if (linkType === "expense") {
      setItemId("");
      setAppointmentId("");
      setQty(1); // Обычно только одна запись на расход
    }
  }, [linkType]);

  const filteredAppointments = useMemo(() => {
    if (!partnerId) return appointments;
    return appointments.filter((apt) => String(apt.client_id) === String(partnerId));
  }, [appointments, partnerId]);

  useEffect(() => {
    if (linkType !== "appointment") return;
    if (!appointmentId) return;
    if (amountTouched) return;
    const price = getAppointmentPrice?.(appointmentId);
    if (price == null) return;
    setAmount(String(price));
  }, [linkType, appointmentId, amountTouched, getAppointmentPrice]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const hasAppointment = linkType === "appointment" && Boolean(appointmentId);
    const hasItem = linkType === "item" && Boolean(itemId);
    const hasExpense = linkType === "expense" && Boolean(expenseId);

    if (!hasAppointment && !hasItem && !hasExpense) return;

    onSubmit({
      partner_id: partnerId,
      appointment_id: linkType === "appointment" ? appointmentId : "",
      item_id: linkType === "item" ? itemId : "",
      expense_id: linkType === "expense" ? expenseId : "",
      qty: linkType === "item" ? Number(qty || 1) : 1,
      amount,
      vat_percent: vatPercent,
      method,
      type,
    });
  };

  const canSubmit =
    Boolean(partnerId) &&
    ((linkType === "appointment" && Boolean(appointmentId)) ||
      (linkType === "item" && Boolean(itemId)) ||
      (linkType === "expense" && Boolean(expenseId))) &&
    Boolean(amount);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Partner *</label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required disabled={loading}>
              <option value="">Select a partner</option>
              {filteredPartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Payment Type</label>
            <select value={type} disabled className="disabled-field">
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
            </select>
          </div>
          <div className="form-group">
            <label>Link to *</label>
            <select value={linkType} onChange={(e) => setLinkType(e.target.value)} disabled={loading}>
              <option value="appointment">Appointment</option>
              <option value="item">Item</option>
              {activeTab === "outgoing" && expenses.length > 0 && (
                <option value="expense">Expense</option>
              )}
            </select>
          </div>

          {linkType === "appointment" && (
            <div className="form-group">
              <label>Appointment *</label>
              <select
                value={appointmentId}
                onChange={(e) => {
                  setAppointmentId(e.target.value);
                  setAmountTouched(false);
                }}
                required
                disabled={loading || !partnerId}
              >
                <option value="">Select appointment</option>
                {filteredAppointments.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.master_name} - {new Date(apt.start_time).toLocaleDateString()}{" "}
                    {new Date(apt.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </option>
                ))}
              </select>
              {partnerId && filteredAppointments.length === 0 && (
                <p style={{ marginTop: 8, color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
                  No appointments found for this partner.
                </p>
              )}
            </div>
          )}

          {linkType === "item" && (
            <>
              <div className="form-group">
                <label>Item *</label>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} required disabled={loading}>
                  <option value="">Select item</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Qty *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                  disabled={loading || !itemId}
                />
              </div>
            </>
          )}

          {linkType === "expense" && (
            <div className="form-group">
              <label>Expense *</label>
              <select value={expenseId} onChange={(e) => setExpenseId(e.target.value)} required disabled={loading}>
                <option value="">Select expense</option>
                {expenses.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>VAT *</label>
            <select value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} required disabled={loading}>
              {vatRates.length === 0 ? (
                <option value="">No VAT rates</option>
              ) : (
                <>
                  <option value="">Select VAT</option>
                  {vatRates.map((v) => (
                    <option key={v.id} value={String(v.percent)}>
                      {v.percent}%{v.is_default === "Y" ? " (default)" : ""}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Amount (VAT incl.)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountTouched(true);
              }}
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
            <button type="submit" disabled={loading || !canSubmit}>
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