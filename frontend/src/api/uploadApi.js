const API_BASE = import.meta.env.VITE_API_URL || "/api";
const BACKEND_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export function toAbsoluteUploadUrl(photoUrl) {
  if (!photoUrl) return "";
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  if (photoUrl.startsWith("/")) return `${BACKEND_ORIGIN}${photoUrl}`;
  return `${BACKEND_ORIGIN}/${photoUrl}`;
}

export async function uploadPhoto(token, entity, id, file) {
  const fd = new FormData();
  fd.append("photo", file);

  const res = await fetch(`${API_BASE}/uploads/${entity}/${id}/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to upload photo");
  }

  return res.json();
}