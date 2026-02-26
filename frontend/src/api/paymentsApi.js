const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const getPayments = async (token, type = 'all') => {
  const url = type === 'all' 
    ? `${API_BASE}/payments`
    : `${API_BASE}/payments?type=${type}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to load payments");
  return response.json();
};

export const createPayment = async (token, payment) => {
  const response = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payment),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create payment");
  }
  return response.json();
};

export const updatePayment = async (token, id, payment) => {
  const response = await fetch(`${API_BASE}/payments/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payment),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update payment");
  }
  return response.json();
};

export const deletePayment = async (token, id) => {
  const response = await fetch(`${API_BASE}/payments/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Failed to delete payment");
  return response.json();
};