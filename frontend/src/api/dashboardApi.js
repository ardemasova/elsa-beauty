const API_BASE = import.meta.env.VITE_API_URL || "/api";

/** Everything the dashboard shows: { from, to, masters?, services?, clients? } */
export async function getDashboard(body) {
  const res = await fetch(`${API_BASE}/dashboard/overview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}
