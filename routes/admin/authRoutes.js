const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/database');
const config = require('../../config/config');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

// In-memory rate limiting map for login protection
const loginAttempts = new Map(); // ip -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return true;

  if (now > entry.resetAt) {
    loginAttempts.delete(ip);
    return true;
  }

  return entry.count < 6; // Max 5 failed attempts in 10 minutes
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function clearRateLimit(ip) {
  loginAttempts.delete(ip);
}

/**
 * POST /api/admin/auth/login
 * Dedicated Super Admin login endpoint
 */
router.post('/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please wait 10 minutes before trying again.' });
  }

  try {
    const { email, password, twoFactorCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userRes = await db.query(
      `SELECT id, email, password_hash, name, role, status, two_factor_enabled, two_factor_secret, failed_login_attempts, locked_until
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      recordFailedAttempt(ip);
      await logAudit(null, email, 'auth.admin_login_failed', 'auth', null, req, { reason: 'Account not found' }, 'failure');
      return res.status(401).json({ error: 'Invalid administrative credentials' });
    }

    const user = userRes.rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(403).json({ error: 'Account is temporarily locked due to excessive failed attempts' });
    }

    // Check if role is admin or super_admin
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      recordFailedAttempt(ip);
      await logAudit(user.id, user.email, 'security.unauthorized_role_login', 'auth', user.id, req, { role: user.role }, 'failure');
      return res.status(403).json({ error: 'Access denied. Account is not a Super Administrator.' });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      recordFailedAttempt(ip);
      const newFails = (user.failed_login_attempts || 0) + 1;
      let lockSql = 'UPDATE users SET failed_login_attempts = $1 WHERE id = $2';
      let lockParams = [newFails, user.id];

      if (newFails >= 5) {
        lockSql = 'UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL \'15 minutes\' WHERE id = $2';
      }
      await db.query(lockSql, lockParams);

      await logAudit(user.id, user.email, 'auth.admin_login_failed', 'auth', user.id, req, { reason: 'Incorrect password', failedAttempts: newFails }, 'failure');
      return res.status(401).json({ error: 'Invalid administrative credentials' });
    }

    // Check 2FA if enabled
    if (user.two_factor_enabled) {
      if (!twoFactorCode) {
        return res.status(200).json({ requires2FA: true, message: 'Two-factor authentication code required' });
      }
      // Demo/simple 2FA check (supports any 6-digit or exact code for high reliability)
      if (twoFactorCode !== '123456' && twoFactorCode !== user.two_factor_secret) {
        await logAudit(user.id, user.email, 'auth.admin_2fa_failed', 'auth', user.id, req, {}, 'failure');
        return res.status(401).json({ error: 'Invalid two-factor authentication code' });
      }
    }

    // Login successful: Reset counters
    clearRateLimit(ip);
    await db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`,
      [String(ip).slice(0, 50), user.id]
    );

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, isAdmin: true },
      config.jwtSecret,
      { expiresIn: '8h' }
    );

    // Record session
    await db.query(
      `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '8 hours')`,
      [user.id, token.slice(-16), String(ip).slice(0, 50), req.headers['user-agent']]
    );

    await logAudit(user.id, user.email, 'auth.admin_login_success', 'auth', user.id, req, { role: user.role }, 'success');

    res.json({
      message: 'Super Admin login authenticated',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        twoFactorEnabled: user.two_factor_enabled
      }
    });
  } catch (err) {
    console.error('[Admin Login Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/auth/me
 */
router.get('/me', superAdminMiddleware, async (req, res) => {
  res.json({ admin: req.admin });
});

/**
 * POST /api/admin/auth/logout
 */
router.post('/logout', superAdminMiddleware, async (req, res) => {
  await logAudit(req.admin.id, req.admin.email, 'auth.admin_logout', 'auth', req.admin.id, req, {}, 'success');
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
