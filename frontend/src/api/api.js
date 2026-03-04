const API_BASE = import.meta.env.VITE_API_URL || "/api";

// Helper функция для запросов с токеном
const apiRequest = async (endpoint, method = "GET", body = null, token) => {
  if (!token) {
    throw new Error("Token missing");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Error: ${response.status}`);
  }

  // IMPORTANT: DELETE 204 has no JSON body
  if (response.status === 204) return null;

  return response.json();
};

// Helper для запросов БЕЗ токена (для auth)
const apiRequestNoAuth = async (endpoint, method = "GET", body = null) => {
  const headers = {
    "Content-Type": "application/json",
  };

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Error: ${response.status}`);
  }

  if (response.status === 204) return null;

  return response.json();
};

// Appointments
export const fetchAppointments = (token) => apiRequest("/appointments", "GET", null, token);

export const getAppointmentsByDateRange = (token, startDate, endDate) =>
  apiRequest(`/appointments?start_date=${startDate}&end_date=${endDate}`, "GET", null, token);

export const createAppointment = (token, data) => apiRequest("/appointments", "POST", data, token);

export const updateAppointment = (token, id, data) => apiRequest(`/appointments/${id}`, "PUT", data, token);

export const deleteAppointment = (token, id) => apiRequest(`/appointments/${id}`, "DELETE", null, token);

// Clients
export const fetchClients = (token) => apiRequest("/clients", "GET", null, token);

export const createClient = (token, data) => apiRequest("/clients", "POST", data, token);

export const updateClient = (token, id, data) => apiRequest(`/clients/${id}`, "PUT", data, token);

export const deleteClient = (token, id) => apiRequest(`/clients/${id}`, "DELETE", null, token);

// Masters
export const fetchMasters = (token) => apiRequest("/masters", "GET", null, token);

export const createMaster = (token, data) => apiRequest("/masters", "POST", data, token);

export const updateMaster = (token, id, data) => apiRequest(`/masters/${id}`, "PUT", data, token);

export const deleteMaster = (token, id) => apiRequest(`/masters/${id}`, "DELETE", null, token);

// Users
// ✅ UPDATED: support optional tenant_id filter
export const fetchUsers = (token, params = {}) => {
  const query = params?.tenant_id ? `?tenant_id=${encodeURIComponent(params.tenant_id)}` : "";
  return apiRequest(`/users${query}`, "GET", null, token);
};

export const createUser = (token, data) => apiRequest("/users", "POST", data, token);

export const updateUser = (token, id, data) => apiRequest(`/users/${id}`, "PUT", data, token);

export const deleteUser = (token, id) => apiRequest(`/users/${id}`, "DELETE", null, token);

// Services
export const fetchServices = (token) => apiRequest("/services", "GET", null, token);

export const createService = (token, data) => apiRequest("/services", "POST", data, token);

export const updateService = (token, id, data) => apiRequest(`/services/${id}`, "PUT", data, token);

export const deleteService = (token, id) => apiRequest(`/services/${id}`, "DELETE", null, token);

// Dashboard
export const getDashboardStats = (token, period, dateRange) =>
  apiRequest(
    `/dashboard/stats?period=${period}&start_date=${dateRange.start}&end_date=${dateRange.end}`,
    "GET",
    null,
    token
  );

export const getMasterStats = (token) => apiRequest("/dashboard/master-stats", "GET", null, token);

// Auth - БЕЗ токена
export const loginUser = (email, password, schema_name) =>
  apiRequestNoAuth("/auth/login", "POST", { email, password, schema_name });

export const registerUser = (data) => apiRequestNoAuth("/auth/register", "POST", data);

// Clients (with type filter)
export const fetchClientsByType = (token, type) => {
  const query = type && type !== "all" ? `?type=${encodeURIComponent(type)}` : "";
  return apiRequest(`/clients${query}`, "GET", null, token);
};

// Payments
export const deletePayment = (token, id) => apiRequest(`/payments/${id}`, "DELETE", null, token);