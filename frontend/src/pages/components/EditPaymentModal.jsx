import { useState, useEffect } from "react";
import { updatePayment } from "../../api/paymentsApi";
import "./EditPaymentModal.css";

export default function EditPaymentModal({ payment, onClose, onSuccess, partners, appointments, token }) {
  const [formData, setFormData] = useState({
    partner_id: payment.partner_id || "",
    appointment_id: payment.appointment_id || "",
    amount: payment.amount || "",
    method: payment.method || "card",
    type: payment.type || 'incoming',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Убедимся что все поля имеют правильные значения
    setFormData({
      partner_id: payment.partner_id ? String(payment.partner_id) : "",
      appointment_id: payment.appointment_id ? String(payment.appointment_id) : "",
      amount: payment.amount ? String(payment.amount) : "",
      method: payment.method || "card",
      type: payment.type || 'incoming',
    });
  }, [payment]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === "partner_id") {
      const partner = partners.find(p => p.id === value);
      const newType = partner?.type === 'customer' ? 'incoming' : 'outgoing';
      setFormData(prev => ({
        ...prev,
        [name]: value,
        type: newType,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Преобразуем amount в число
      const paymentData = {
        ...formData,
        amount: parseFloat(formData.amount),
        appointment_id: formData.appointment_id || null,
      };

      await updatePayment(token, payment.id, paymentData);
      onSuccess();
    } catch (err) {
      setError(err.message || "Failed to update payment");
    } finally {
      setLoading(false);
    }
  };

  const filteredAppointments = formData.partner_id
    ? appointments.filter(apt => apt.partner_id === formData.partner_id || !apt.partner_id)
    : appointments;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Payment</h2>
        
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Partner *</label>
            <select
              name="partner_id"
              value={formData.partner_id || ""}
              onChange={handleChange}
              required
            >
              <option value="">Select a partner</option>
              {partners.map(partner => (
                <option key={partner.id} value={partner.id}>
                  {partner.name} ({partner.type === 'customer' ? 'Customer' : 'Vendor'})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Payment Type *</label>
            <select
              name="type"
              value={formData.type || ""}
              onChange={handleChange}
              disabled
              className="disabled-field"
            >
              <option value="incoming">Incoming (Customer)</option>
              <option value="outgoing">Outgoing (Vendor)</option>
            </select>
            <small>Automatically set based on partner type</small>
          </div>

          <div className="form-group">
            <label>Appointment (Optional)</label>
            <select
              name="appointment_id"
              value={formData.appointment_id || ""}
              onChange={handleChange}
              disabled={!formData.partner_id}
            >
              <option value="">No appointment</option>
              {filteredAppointments.map(apt => (
                <option key={apt.id} value={apt.id}>
                  {apt.master_name} - {new Date(apt.start_time).toLocaleDateString()} {new Date(apt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Amount *</label>
            <input
              type="number"
              name="amount"
              value={formData.amount || ""}
              onChange={handleChange}
              step="0.01"
              min="0"
              required
            />
          </div>

          <div className="form-group">
            <label>Method *</label>
            <select
              name="method"
              value={formData.method || ""}
              onChange={handleChange}
              required
            >
              <option value="card">Card</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !formData.partner_id}>
              {loading ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}