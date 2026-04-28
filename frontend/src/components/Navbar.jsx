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

function getRoleFromToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.role || null;
  } catch {
    return null;
  }
}

export default function Navbar({ onCollapsedChange }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
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
    localStorage.removeItem("token");
    window.dispatchEvent(new CustomEvent("tokenChanged", { detail: null }));
    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 100);
  };

  const isActive = (path) => location.pathname === path;

  const isMaster = role === "master";
  const isAdmin = role === "admin";

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
          { path: "/ai-assistant", label: "AI Assistant", icon: AIIcon },
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

        <button className="navbar-logout" onClick={logout} title={isCollapsed ? "Logout" : ""}>
          <img src={logoutIcon} alt="Logout" className="nav-icon" />
          <span>Logout</span>
        </button>
      </aside>
    </>
  );
}