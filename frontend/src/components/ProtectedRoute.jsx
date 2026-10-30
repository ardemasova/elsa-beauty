import { Navigate, useLocation } from "react-router-dom";
import { getToken, getTokenPayload } from "../auth/session";

/**
 * Hides pages from users who are not logged in or lack the role.
 * This is only for convenience: the API enforces the same rules.
 *
 *   <ProtectedRoute>                -> any logged-in user
 *   <ProtectedRoute adminOnly>      -> admins and owners
 */
function isLoggedIn(payload) {
  return Boolean(payload) && (!payload.exp || payload.exp * 1000 > Date.now());
}

export default function ProtectedRoute({ children, adminOnly = false }) {
  const location = useLocation();
  const payload = getTokenPayload(getToken());

  if (!isLoggedIn(payload)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && payload.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
