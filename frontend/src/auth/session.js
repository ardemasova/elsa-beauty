/**
 * Login session helpers.
 *
 * The token stays in localStorage under "token" (every page already reads it
 * there). The server re-checks role and branch access on every request, so
 * values decoded here are only for showing/hiding UI.
 */
const API_BASE = import.meta.env.VITE_API_URL || "/api";
const SESSION_KEY = "session"; // { user, account, tenants, currentTenant, features }

export function getToken() {
  return localStorage.getItem("token");
}

export function getTokenPayload(token = getToken()) {
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  } catch {
    return null;
  }
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

/** Saves a login / switch-tenant / refresh response and notifies the app. */
export function saveSession(data) {
  if (data?.token) localStorage.setItem("token", data.token);
  if (data?.user) {
    const { token: _t, ...rest } = data;
    localStorage.setItem(SESSION_KEY, JSON.stringify(rest));
  }
  window.dispatchEvent(new CustomEvent("tokenChanged", { detail: getToken() }));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("tokenChanged", { detail: null }));
}

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export async function login(email, password) {
  const data = await post("/auth/login", { email, password });
  saveSession(data);
  return data;
}

export async function switchTenant(tenantId) {
  const data = await post("/auth/switch-tenant", { tenant_id: tenantId });
  saveSession(data);
  return data;
}

export async function reloadSession() {
  const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return null;
  const data = await res.json();
  saveSession(data);
  return data;
}

export function changePassword(currentPassword, newPassword) {
  return post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
}

/**
 * - Any API answer 401 on an authenticated request -> session is over, go to login.
 * - Token close to expiry -> refreshed in the background, so active users are
 *   not thrown out in the middle of work.
 */
export function installSessionHandling() {
  const originalFetch = window.fetch.bind(window);
  let redirecting = false;

  window.fetch = async (input, init = {}) => {
    const res = await originalFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const url = typeof input === "string" ? input : input.url;
    const hadAuth = headers.has("Authorization") && headers.get("Authorization") !== "Bearer null";

    if (res.status === 401 && hadAuth && !url.includes("/auth/login") && !redirecting) {
      redirecting = true;
      clearSession();
      window.location.assign("/login?expired=1");
    }
    return res;
  };

  const refreshIfNeeded = async () => {
    const p = getTokenPayload();
    if (!p?.exp) return;
    const secondsLeft = p.exp - Date.now() / 1000;
    if (secondsLeft > 0 && secondsLeft < 60 * 60) {
      try {
        const data = await post("/auth/refresh");
        if (data?.token) {
          localStorage.setItem("token", data.token);
          window.dispatchEvent(new CustomEvent("tokenChanged", { detail: data.token }));
        }
      } catch {
        /* the 401 handler takes over if the session is really gone */
      }
    }
  };
  refreshIfNeeded();
  setInterval(refreshIfNeeded, 5 * 60 * 1000);
}
