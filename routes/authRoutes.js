const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const config = require('../config/config');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, companyName } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and full name are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if email already taken
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const initialCredit = 20.00; // Welcome credits to test renting immediately

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, name, company_name, balance, currency, role)
         VALUES ($1, $2, $3, $4, $5, 'USD', 'customer') RETURNING id, email, name, company_name, balance, currency, role, created_at`,
        [email.toLowerCase().trim(), passwordHash, name.trim(), companyName ? companyName.trim() : null, initialCredit]
      );
      const user = userRes.rows[0];

      // Record welcome bonus transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
         VALUES ($1, 'deposit', $2, $3, 'Welcome bonus credits for number rentals', 'completed')`,
        [user.id, initialCredit, initialCredit]
      );

      await client.query('COMMIT');

      const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn
      });

      res.status(201).json({
        message: 'Account successfully registered!',
        user: { ...user, balance: parseFloat(user.balance) },
        token
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Auth Register Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userRes = await db.query(
      'SELECT id, email, password_hash, name, company_name, balance, currency, role, created_at FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn
    });

    const { password_hash, ...safeUser } = user;
    safeUser.balance = parseFloat(safeUser.balance);

    res.json({
      message: 'Login successful',
      user: safeUser,
      token
    });
  } catch (err) {
    console.error('[Auth Login Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
