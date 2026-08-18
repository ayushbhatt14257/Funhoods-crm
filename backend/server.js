require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const dealerRoutes = require('./routes/dealerRoutes');
const aliasRoutes = require('./routes/aliasRoutes');
const piRoutes = require('./routes/piRoutes');
const dispatchRoutes = require('./routes/dispatchRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const importRoutes = require('./routes/importRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

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
