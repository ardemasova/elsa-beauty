import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./Navbar.css";
import logo from "../assets/logo.png";
import dashboardIcon from "../assets/icons/dashboard.svg";
import mastersIcon from "../assets/icons/masters.svg";
import clientsIcon from "../assets/icons/clients.svg";
import ItemsIcon from "../assets/icons/items.svg";
import appointmentsIcon from "../assets/icons/appointments.svg";
import reportsIcon from "../assets/icons/reports.svg";
import usersIcon from "../assets/icons/users.png";
import logoutIcon from "../assets/icons/logout.svg";
import toggleIcon from "../assets/icons/toggle.svg";
import paymentsIcon from "../assets/icons/payments.svg";
import SettingsIcon from "../assets/icons/settings.svg";
import AIIcon from "../assets/icons/AI.svg";

import { changePassword, clearSession, getSession, getTokenPayload, reloadSession, switchTenant } from "../auth/session";

function getRoleFromToken(token) {
  return getTokenPayload(token)?.role || null;
}

/** Branch selector: shown when the user can work in more than one branch. */
function BranchSwitcher({ collapsed }) {
  const [session, setSession] = useState(() => getSession());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Sessions saved by older versions have no branch list: fetch it once.
    if (!session?.tenants) reloadSession().then((s) => s && setSession(s));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tenants = session?.tenants || [];
  const current = session?.currentTenant;
  if (collapsed || !current) return null;

  if (tenants.length < 2) {
    return <div className="branch-current" title="Current branch">{current.name}</div>;
  }

  const onChange = async (e) => {
    setBusy(true);
    setError("");
    try {
      await switchTenant(e.target.value);
      // Full reload: every page re-reads the token and loads the new branch's data.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="branch-switcher">
      <label htmlFor="branch-select">Branch</label>
      <select id="branch-select" value={current.id} onChange={onChange} disabled={busy}>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {error && <div className="branch-error">{error}</div>}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 10) return setMsg({ type: "error", text: "New password must be at least 10 characters" });
    if (next !== repeat) return setMsg({ type: "error", text: "Passwords do not match" });
    setBusy(true);
    try {
      await changePassword(current, next);
      setMsg({ type: "ok", text: "Password changed" });
      setTimeout(onClose, 1200);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Change password</h3>
        <form onSubmit={submit}>
          {msg.text && (
            <p className={msg.type === "ok" ? "success-message" : "error-message"}>{msg.text}</p>
          )}
          <div className="form-group">
            <label>Current password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label>New password (min. 10 characters)</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label>Repeat new password</label>
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="modal-actions">
            <button type="submit" disabled={busy}>{busy ? "Saving..." : "Change password"}</button>
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Navbar({ onCollapsedChange }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState(() => getRoleFromToken(localStorage.getItem("token")));

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    onCollapsedChange?.(isCollapsed);
  }, [isCollapsed, onCollapsedChange]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  const closeMobileMenu = useCallback(() => setIsMobileOpen(false), []);

  // keep role in sync if token changes (you already dispatch tokenChanged)
  useEffect(() => {
    const handler = (e) => {
      const nextToken = e?.detail ?? localStorage.getItem("token");
      setRole(getRoleFromToken(nextToken));
    };

    window.addEventListener("tokenChanged", handler);
    return () => window.removeEventListener("tokenChanged", handler);
  }, []);

  const logout = () => {
    clearSession();
    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 100);
  };

  const isActive = (path) => location.pathname === path;

  const isMaster = role === "master";

  const navSections = useMemo(() => {
    const sections = [
      {
        title: "Main",
        items: [
          { path: "/dashboard", label: "Dashboard", icon: dashboardIcon },
          { path: "/appointments", label: "Appointments", icon: appointmentsIcon },
          { path: "/payments", label: "Invoices", icon: paymentsIcon },
        ],
      },
      {
        title: "Management",
        items: [
          { path: "/clients", label: "Partners", icon: clientsIcon },
          // hide for master
          ...(isMaster ? [] : [{ path: "/masters", label: "Masters", icon: mastersIcon }]),
          { path: "/services", label: "Items", icon: ItemsIcon },
          // hide for master
          ...(isMaster ? [] : [{ path: "/users", label: "Users", icon: usersIcon }]),
        ],
      },
      {
        title: "Reports",
        items: [
          { path: "/reports", label: "Reports", icon: reportsIcon },
          ...(isMaster ? [] : [{ path: "/ai-assistant", label: "AI Assistant", icon: AIIcon }]),
        ],
      },
      // hide Settings section entirely for master
      ...(isMaster
        ? []
        : [
            {
              title: "System",
              items: [{ path: "/settings", label: "Settings", icon: SettingsIcon }],
            },
          ]),
    ];

    return sections;
  }, [isMaster]);

  return (
    <>
      {/* Hamburger button – visible only on mobile (<768px) */}
      <button
        className={`hamburger-btn ${isMobileOpen ? "is-open" : ""}`}
        onClick={() => setIsMobileOpen((v) => !v)}
        aria-label={isMobileOpen ? "Close menu" : "Open menu"}
      >
        <span />
        <span />
        <span />
      </button>

      {/* Overlay – closes menu on tap outside */}
      {isMobileOpen && (
        <div className="navbar-overlay" onClick={closeMobileMenu} aria-hidden="true" />
      )}

      <aside className={`navbar-sidebar ${isCollapsed ? "collapsed" : ""} ${isMobileOpen ? "mobile-open" : ""}`}>
        <div className="navbar-logo">
          <img src={logo} alt="ELSA Beauty" className="logo-image" />
          <button
            className="toggle-btn"
            onClick={() => setIsCollapsed((v) => !v)}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <img src={toggleIcon} alt="Toggle" className="toggle-icon" />
          </button>
        </div>

        <BranchSwitcher collapsed={isCollapsed} />

        <nav className="navbar-menu">
          {navSections.map((section) => (
            <div className="nav-section" key={section.title}>
              {!isCollapsed && <div className="nav-section-title">{section.title}</div>}

              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${isActive(item.path) ? "active" : ""}`}
                  title={isCollapsed ? item.label : ""}
                  onClick={closeMobileMenu}
                >
                  <img src={item.icon} alt={item.label} className="nav-icon" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {!isCollapsed && (
          <button className="navbar-password" type="button" onClick={() => setShowPassword(true)}>
            Change password
          </button>
        )}

        <button className="navbar-logout" onClick={logout} title={isCollapsed ? "Logout" : ""}>
          <img src={logoutIcon} alt="Logout" className="nav-icon" />
          <span>Logout</span>
        </button>
      </aside>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </>
  );
}