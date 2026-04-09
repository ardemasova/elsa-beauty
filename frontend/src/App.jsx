import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Appointments from "./pages/Appointments";
import Masters from "./pages/Masters";
import Services from "./pages/Services";
import Clients from "./pages/Clients";
import Users from "./pages/Users";
import Payments from "./pages/Payments";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import AiAssistant from "./pages/AIAssistant";
import Invoice from "./pages/Invoice";
import MasterPerformanceReport from "./components/MasterPerformanceReport";
import "./App.css";

function App() {
  const [isAuth, setIsAuth] = useState(!!localStorage.getItem("token"));
  const [isNavbarCollapsed, setIsNavbarCollapsed] = useState(false);

  useEffect(() => {
    const handleTokenChange = () => {
      setIsAuth(!!localStorage.getItem("token"));
    };

    window.addEventListener("tokenChanged", handleTokenChange);
    return () => window.removeEventListener("tokenChanged", handleTokenChange);
  }, []);

  return (
    <Router>
      {isAuth && (
        <Navbar onCollapsedChange={(collapsed) => setIsNavbarCollapsed(collapsed)} />
      )}

      <main className={`${isAuth ? "main-with-navbar" : ""} ${isAuth && isNavbarCollapsed ? "navbar-collapsed" : ""}`}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/appointments"
            element={
              <ProtectedRoute>
                <Appointments />
              </ProtectedRoute>
            }
          />

          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <Payments />
              </ProtectedRoute>
            }
          />

          <Route
            path="/invoices/:paymentId"
            element={
              <ProtectedRoute>
                <Invoice />
              </ProtectedRoute>
            }
          />

          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <Clients />
              </ProtectedRoute>
            }
          />

          <Route
            path="/masters"
            element={
              <ProtectedRoute>
                <Masters />
              </ProtectedRoute>
            }
          />

          <Route
            path="/services"
            element={
              <ProtectedRoute>
                <Services />
              </ProtectedRoute>
            }
          />

          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports/masters"
            element={
              <ProtectedRoute>
                <MasterPerformanceReport />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ai-assistant"
            element={
              <ProtectedRoute>
                <AiAssistant />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;