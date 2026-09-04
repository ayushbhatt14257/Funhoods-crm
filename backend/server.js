require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./modules/auth/routes');
const productRoutes = require('./modules/products/routes');
const dealerRoutes = require('./modules/dealers/routes');
const aliasRoutes = require('./modules/aliases/routes');
const categoryRoutes = require('./modules/categories/routes');
const piRoutes = require('./modules/pi/routes');
const dispatchRoutes = require('./modules/dispatch/routes');
const invoiceRoutes = require('./modules/invoices/routes');
const inventoryRoutes = require('./modules/inventory/routes');
const settingsRoutes = require('./modules/settings/routes');
const importRoutes = require('./modules/import/routes');
const ledgerRoutes = require('./modules/ledger/routes');
const userRoutes = require('./modules/users/routes');
const notificationRoutes = require('./modules/notifications/routes');

const app = express();

connectDB();

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dealers', dealerRoutes);
app.use('/api/aliases', aliasRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/pi', piRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);

// Central error handler (catches thrown errors from async routes not already try/caught)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Funhoods CRM API running on port ${PORT}`));
