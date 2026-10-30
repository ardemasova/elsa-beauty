const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

async function request(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const parsed = text ? JSON.parse(text) : null;
      throw new Error(parsed?.message || text || `Request failed (${res.status})`);
    } catch {
      throw new Error(text || `Request failed (${res.status})`);
    }
  }

  if (res.status === 204) return null;
  return res.json();
}

export function fetchTenants(token) {
  return request("/tenants", token);
}


export function createTenant(token, payload) {
  return request("/tenants", token, { method: "POST", body: JSON.stringify(payload) });
}

export function updateTenant(token, id, payload) {
  return request(`/tenants/${id}`, token, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteTenant(token, id) {
  return request(`/tenants/${id}`, token, { method: "DELETE" });
}