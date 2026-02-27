const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');    
const usersRoutes = require('./routes/users');
const mastersRoutes = require('./routes/masters');
const servicesRoutes = require('./routes/services');
const clientsRoutes = require('./routes/clients');
const appointmentsRoutes = require('./routes/appointments');
const dashboardRoutes = require('./routes/dashboard');
const paymentsRouter = require('./routes/payments');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');

require('dotenv').config();

const app = express();

app.use(cors({
  origin: [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://46.225.185.172:5173',
  'http://46.225.185.172:5174'
],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Elsa ERP API running at http://0.0.0.0:${PORT}`);
});