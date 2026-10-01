const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../config/database');

/**
 * Super Admin Authentication & Authorization Middleware
 * Verifies JWT token, ensures user account is active, and verifies SUPER_ADMIN or authorized role
 */
async function superAdminMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Super Admin authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const userRes = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.two_factor_enabled, u.last_login_at
       FROM users u
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Admin account not found' });
    }

    const adminUser = userRes.rows[0];

    // Check account status
    if (adminUser.status === 'suspended') {
      return res.status(403).json({ error: 'This administrative account has been suspended' });
    }
    if (adminUser.status === 'deactivated') {
      return res.status(403).json({ error: 'This administrative account is deactivated' });
    }

    // Role verification: Super Admin check
    if (adminUser.role !== 'super_admin' && adminUser.role !== 'admin') {
      // Log unauthorized attempt to audit log
      logAudit(null, adminUser.email, 'security.unauthorized_admin_access', 'system', 'admin_portal', req, {
        reason: 'User lacks super_admin role',
        attemptedRole: adminUser.role
      }, 'failure').catch(() => {});

      return res.status(403).json({ error: 'Access denied: Requires Super Administrator privileges' });
    }

    req.admin = adminUser;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Admin session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid admin token' });
  }
}

/**
 * Audit Logging Helper Function
 */
async function logAudit(adminId, adminEmail, action, entityType, entityId, req, details = {}, status = 'success') {
  const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : '127.0.0.1';
  const ua = req ? req.headers['user-agent'] : null;

  try {
    await db.query(
      `INSERT INTO audit_logs (admin_id, admin_email, action, entity_type, entity_id, ip_address, user_agent, details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [adminId, adminEmail, action, entityType, entityId, String(ip).slice(0, 50), ua, JSON.stringify(details), status]
    );
  } catch (err) {
    console.error('[Audit Logger Error]:', err.message);
  }
}

module.exports = {
  superAdminMiddleware,
  logAudit
};
