import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getInvoiceData, getCompanySettings } from "../api/invoiceApi";
import "./Invoice.css";

export default function Invoice() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [invoice, setInvoice] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadInvoiceData();
  }, [paymentId, token]);

  const loadInvoiceData = async () => {
    try {
      const [invoiceData, companyData] = await Promise.all([
        getInvoiceData(paymentId, token),
        getCompanySettings(token),
      ]);
      setInvoice(invoiceData);
      setCompany(companyData);
      setError("");
    } catch (err) {
      console.error("Failed to load invoice:", err);
      setError(err.message || "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    navigate("/payments");
  };

  if (loading) {
    return <div className="invoice-loading">Loading invoice...</div>;
  }

  if (error) {
    return (
      <div className="invoice-error">
        <p>{error}</p>
        <button onClick={handleBack}>Back to Payments</button>
      </div>
    );
  }

  if (!invoice || !company) {
    return (
      <div className="invoice-error">
        <p>Invoice not found</p>
        <button onClick={handleBack}>Back to Payments</button>
      </div>
    );
  }

  const {
    payment,
    partner,
    appointment,
  } = invoice;

  return (
    <div className="invoice-container">
      <div className="invoice-toolbar">
        <button className="btn-secondary" onClick={handleBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={handlePrint}>
          🖨️ Print
        </button>
      </div>

      <div className="invoice-wrapper">
        <div className="invoice">
          {/* Header */}
          <div className="invoice-header">
            <div className="company-info">
              <h1 className="company-name">{company.name}</h1>
              {company.address && <p className="company-address">{company.address}</p>}
              {company.phone && <p className="company-phone">{company.phone}</p>}
              {company.email && <p className="company-email">{company.email}</p>}
              {company.vat_number && <p className="company-vat">VAT: {company.vat_number}</p>}
            </div>

            <div className="invoice-meta">
              <h2>INVOICE</h2>
              <p><strong>Invoice #:</strong> {payment.id.substring(0, 8).toUpperCase()}</p>
              <p><strong>Date:</strong> {new Date(payment.paid_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Bill To */}
          <div className="invoice-section">
            <div className="bill-to">
              <h3>Bill To</h3>
              <p className="partner-name">{partner.name}</p>
              {partner.address && <p>{partner.address}</p>}
              {partner.phone && <p>{partner.phone}</p>}
              {partner.email && <p>{partner.email}</p>}
            </div>

            <div className="invoice-details">
              <div className="detail-item">
                <span>Invoice Date:</span>
                <strong>{new Date(payment.paid_at).toLocaleDateString()}</strong>
              </div>
              {appointment && (
                <>
                  <div className="detail-item">
                    <span>Service Date:</span>
                    <strong>{new Date(appointment.start_time).toLocaleDateString()}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Master:</span>
                    <strong>{appointment.master_name}</strong>
                  </div>
                </>
              )}
              <div className="detail-item">
                <span>Payment Method:</span>
                <strong className="capitalize">{payment.method}</strong>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="invoice-section">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {appointment ? (
                  <tr>
                    <td>{appointment.service_name || 'Service'}</td>
                    <td className="text-center">1</td>
                    <td className="text-right">${payment.amount.toFixed(2)}</td>
                    <td className="text-right"><strong>${payment.amount.toFixed(2)}</strong></td>
                  </tr>
                ) : (
                  <tr>
                    <td>Payment</td>
                    <td className="text-center">1</td>
                    <td className="text-right">${payment.amount.toFixed(2)}</td>
                    <td className="text-right"><strong>${payment.amount.toFixed(2)}</strong></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="invoice-section">
            <div className="invoice-totals">
              <div className="total-row">
                <span>Subtotal:</span>
                <strong>${payment.amount.toFixed(2)}</strong>
              </div>
              <div className="total-row">
                <span>Tax (0%):</span>
                <strong>$0.00</strong>
              </div>
              <div className="total-row total">
                <span>Total Due:</span>
                <strong>${payment.amount.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="invoice-footer">
            <p>Thank you for your business!</p>
            <p className="footer-note">
              Payment was received on {new Date(payment.paid_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}