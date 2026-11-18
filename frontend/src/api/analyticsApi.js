const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function get(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/analytics${path}?${qs}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export const getOverview = (period) => get("/overview", period);
export const getBreakdown = (by, period) => get(`/breakdown/${by}`, period);
export const getReceivables = (period) => get("/receivables", period);
export const getBranches = (period) => get("/branches", period);
export const getMyFigures = (period) => get("/me", period);
