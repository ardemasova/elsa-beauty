const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const getInvoiceData = async (paymentId, token) => {
  const response = await fetch(`${API_BASE}/payments/${paymentId}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load invoice');
  return response.json();
};

export const getCompanySettings = async (token) => {
  const response = await fetch(`${API_BASE}/settings/company`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load company settings');
  return response.json();
};