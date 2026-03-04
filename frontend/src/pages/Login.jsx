import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api/api";
import logo from "../assets/logo.png";
import "./Login.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [schemaName, setSchemaName] = useState("");
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      setBranchesLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/tenants/public`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.message || `Failed to load branches (${res.status})`);
        }

        if (cancelled) return;

        setBranches(Array.isArray(data) ? data : []);

        // auto-select first branch
        const first = Array.isArray(data) && data.length > 0 ? data[0].schema_name : "";
        setSchemaName((prev) => prev || first);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load branches");
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    }

    loadBranches();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await loginUser(email, password, schemaName);
      const token = response.token;

      localStorage.setItem("token", token);
      window.dispatchEvent(new CustomEvent("tokenChanged", { detail: token }));

      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 100);
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && !branchesLoading && !!schemaName;

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src={logo} alt="ELSA Beauty" className="logo-img" />
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form compact">
          <div className="form-group compact">
            <label htmlFor="schema">Branch</label>
            <select
              id="schema"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              required
              disabled={loading || branchesLoading}
            >
              {branches.map((b) => (
                <option key={b.id ?? b.schema_name} value={b.schema_name}>
                  {b.name ? `${b.name} (${b.schema_name})` : b.schema_name}
                </option>
              ))}
            </select>
          </div>

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

          <button type="submit" disabled={!canSubmit} className="login-btn">
            {loading ? "Logging in..." : branchesLoading ? "Loading branches..." : "Login"}
          </button>
        </form>

        <p className="login-footer">© 2026 ELSA Beauty. All rights reserved.</p>
      </div>
    </div>
  );
}