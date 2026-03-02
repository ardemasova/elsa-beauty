import { useState } from "react";
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

export default function Navbar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const logout = () => {
    localStorage.removeItem("token");
    window.dispatchEvent(new CustomEvent("tokenChanged", { detail: null }));
    setTimeout(() => {
      navigate("/login", { replace: true });
    }, 100);
  };

  const isActive = (path) => location.pathname === path;

  const navSections = [
    {
      title: "Main",
      items: [
        { path: "/dashboard", label: "Dashboard", icon: dashboardIcon },
        { path: "/appointments", label: "Appointments", icon: appointmentsIcon },
        { path: "/payments", label: "Payments", icon: paymentsIcon },
      ],
    },
    {
      title: "Management",
      items: [
        { path: "/clients", label: "Partners", icon: clientsIcon },
        { path: "/masters", label: "Masters", icon: mastersIcon },
        { path: "/services", label: "Items", icon: ItemsIcon },
        { path: "/users", label: "Users", icon: usersIcon },
      ],
    },
    {
      title: "Reports",
      items: [
        { path: "/reports", label: "Reports", icon: reportsIcon },
        { path: "/ai-assistant", label: "AI Assistant", icon: AIIcon },
      ],
    },
    {
      title: "System",
      items: [
        { path: "/settings", label: "Settings", icon: SettingsIcon },
      ],
    },
  ];

  return (
    <aside className={`navbar-sidebar ${isCollapsed ? "collapsed" : ""}`}>
      {/* Logo */}
      <div className="navbar-logo">
        <img src={logo} alt="ELSA Beauty" className="logo-image" />
        <button
          className="toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <img src={toggleIcon} alt="Toggle" className="toggle-icon" />
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="navbar-menu">
        {navSections.map((section) => (
          <div className="nav-section" key={section.title}>
            {/* Заголовок секции (не кликабельный) */}
            {!isCollapsed && (
              <div className="nav-section-title">{section.title}</div>
            )}

            {section.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive(item.path) ? "active" : ""}`}
                title={isCollapsed ? item.label : ""}
              >
                {typeof item.icon === "string" && item.icon.length <= 3 ? (
                  <span className="nav-icon-emoji" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : (
                  <img src={item.icon} alt={item.label} className="nav-icon" />
                )}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Logout Button */}
      <button
        className="navbar-logout"
        onClick={logout}
        title={isCollapsed ? "Logout" : ""}
      >
        <img src={logoutIcon} alt="Logout" className="nav-icon" />
        <span>Logout</span>
      </button>
    </aside>
  );
}