const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');
const expirationWorker = require('./services/expirationWorker');

// Initialize Express app
const app = express();

// Middlewares
app.use(cors());

// Important: Raw body for Stripe webhook before json parsing
app.use('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Customer API routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/numbers', require('./routes/numberRoutes'));
app.use('/api/rentals', require('./routes/rentalRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/billing', require('./routes/billingRoutes'));
app.use('/api/webhooks/telephony', require('./routes/webhookRoutes'));
app.use('/api/simulator', require('./routes/simulatorRoutes'));

// Super Admin API routes (Protected by server-side SUPER_ADMIN authorization)
app.use('/api/admin/auth', require('./routes/admin/authRoutes'));
app.use('/api/admin/dashboard', require('./routes/admin/dashboardRoutes'));
app.use('/api/admin/users', require('./routes/admin/userRoutes'));
app.use('/api/admin/roles', require('./routes/admin/roleRoutes'));
app.use('/api/admin/telephony', require('./routes/admin/telephonyRoutes'));
app.use('/api/admin/rentals', require('./routes/admin/rentalRoutes'));
app.use('/api/admin/billing', require('./routes/admin/billingRoutes'));
app.use('/api/admin/cms', require('./routes/admin/cmsRoutes'));
app.use('/api/admin/database', require('./routes/admin/databaseRoutes'));
app.use('/api/admin/settings', require('./routes/admin/settingsRoutes'));
app.use('/api/admin/system', require('./routes/admin/systemRoutes'));
app.use('/api/admin/audit', require('./routes/admin/auditRoutes'));
app.use('/api/admin/search', require('./routes/admin/searchRoutes'));
app.use('/api/admin/media', require('./routes/admin/mediaRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Numora Telephony Platform',
    provider: config.telephony.provider,
    timestamp: new Date()
  });
});

// App & Admin Route aliases
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err.stack);
  res.status(500).json({ error: 'Internal server error occurred' });
});

// Start background expiration and auto-renewal scheduler
expirationWorker.start(30000);

// Start Server
const server = app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Numora Telephony Engine & Super Admin Console Active`);
  console.log(`🌐 Customer App: ${config.baseUrl}`);
  console.log(`🛡️ Super Admin:  ${config.baseUrl}/admin.html`);
  console.log(`📞 Active Telephony Engine: ${config.telephony.provider.toUpperCase()}`);
  console.log(`📡 Inbound Webhook URL: ${config.baseUrl}/api/webhooks/telephony/inbound-sms`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Numora] Shutting down gracefully...');
  expirationWorker.stop();
  server.close(() => process.exit(0));
});

module.exports = server;
