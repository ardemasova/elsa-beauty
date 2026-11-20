import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../auth/session";
import logo from "../assets/logo.png";
import "./Login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const expired = new URLSearchParams(location.search).has("expired");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src={logo} alt="ELSA Beauty" className="logo-img" />
        </div>

        {error && <div className="error-message">{error}</div>}
        {!error && expired && (
          <div className="error-message">Your session has ended. Please log in again.</div>
        )}

        <form onSubmit={handleSubmit} className="login-form compact">
          <div className="form-group compact">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group compact">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="login-footer">© 2026 ELSA Beauty. All rights reserved.</p>
      </div>
    </div>
  );
}
