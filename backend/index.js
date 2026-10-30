require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// ---------------------------------------------------------------------------
// Configuration checks: refuse to start with missing or weak secrets.
// ---------------------------------------------------------------------------
const secret = process.env.ACCESS_TOKEN_SECRET || "";
if (secret.length < 32) {
  console.error(
    "❌ ACCESS_TOKEN_SECRET is missing or shorter than 32 characters.\n" +
      "   Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
  );
  process.exit(1);
}

const db = require("./db");
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
const expensesRoutes = require("./routes/expenses");
const demoRegisterRoutes = require("./routes/demo-register");

const app = express();
const isProd = process.env.NODE_ENV === "production";

// Behind nginx / a load balancer: needed for correct client IPs in rate limits.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.disable("x-powered-by");

app.use(
  helmet({
    // The API only returns JSON and images; images are loaded by the frontend
    // from another origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  "https://app.elsaerp.com,https://www.app.elsaerp.com,http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true, limit: "200kb" }));

// Uploaded photos (static files). Missing files return 404 without reaching the API.
const uploadsPath = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsPath, { recursive: true });
app.use("/uploads", express.static(uploadsPath, { fallthrough: false, dotfiles: "deny", index: false }));

// API responses must never be cached by browsers or proxies (they carry private data).
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

if (!isProd) {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------
const limiter = (windowMinutes, max, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message },
  });

app.use("/api/auth/login", limiter(15, 20, "Too many login attempts. Try again in 15 minutes."));
app.use("/api/auth/change-password", limiter(15, 10, "Too many attempts. Try again later."));
app.use("/api/demo-register", limiter(60, 5, "Too many registrations from this address. Try again later."));
// AI calls cost money per request.
app.use(["/api/reports/admin-chat", "/api/reports/ai-summary", "/api/reports/schedule-insights"],
  limiter(60, 60, "AI request limit reached. Try again later."));
app.use("/api", limiter(1, 600, "Too many requests. Slow down a little."));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

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
app.use("/api/expenses", expensesRoutes);
app.use("/api/demo-register", demoRegisterRoutes);
app.use("/api/uploads", uploadsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Central error handler: never send stack traces or SQL errors to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON" });
  if (err.code === "22P02") return res.status(400).json({ message: "Invalid identifier" });
  if (err.code === "23503") return res.status(409).json({ message: "This record is in use and cannot be changed or deleted" });
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
  console.error(`ERROR ${req.method} ${req.path}:`, err);
  res.status(500).json({ message: "Server error" });
});

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Elsa ERP API running on port ${PORT}`);
  });
}

module.exports = app;
