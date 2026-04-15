const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const mastersRoutes = require("./routes/masters");
const servicesRoutes = require("./routes/services");
const itemsRoutes = require("./routes/items");
const clientsRoutes = require("./routes/clients");
const appointmentsRoutes = require("./routes/appointments");
const dashboardRoutes = require("./routes/dashboard");
const paymentsRouter = require("./routes/payments");
const reportsRouter = require("./routes/reports");
const settingsRouter = require("./routes/settings");
const tenantsRouter = require("./routes/tenants");
const uploadsRoutes = require("./routes/uploads");
const vatRoutes = require("./routes/vat");
const expensesRoutes = require('./routes/expenses');

const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();

/**
 * ✅ Uploads folder (served as static files)
 * URL:  http://localhost:3000/uploads/masters/<file>.png
 * Path: <project>/backend/uploads/...
 */
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

// IMPORTANT: fallthrough:false ensures missing files don't reach your JSON 404 handler
app.use("/uploads", express.static(uploadsPath, { fallthrough: false }));

const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://46.225.185.172',
  'http://46.225.185.172:5173',
  'http://46.225.185.172:5174',
  'https://app.elsaerp.com',
  'https://www.app.elsaerp.com',
];

app.use(cors({ 
  origin: allowedOrigins, 
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// (Optional) Debug route: check if a file exists in uploads dir
// Example:
// http://localhost:3000/__debug/file?p=masters/<filename>.png
app.get("/__debug/file", (req, res) => {
  const rel = req.query.p;
  const full = path.join(uploadsPath, rel || "");
  res.json({
    cwd: process.cwd(),
    __dirname,
    uploadsPath,
    rel,
    full,
    exists: rel ? fs.existsSync(full) : null,
    stat: rel
      ? (() => {
          try {
            const s = fs.statSync(full);
            return { isFile: s.isFile(), size: s.size };
          } catch (e) {
            return { error: e.message };
          }
        })()
      : null,
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/masters", mastersRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/items", itemsRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/payments", paymentsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/vat", vatRoutes);
app.use('/api/expenses', expensesRoutes);

// Upload API (POST /api/uploads/...)
app.use("/api/uploads", uploadsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Elsa ERP API running at http://0.0.0.0:${PORT}`);
});

// Disable caching for API responses (fixes 304 Not Modified issues during dev)
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});