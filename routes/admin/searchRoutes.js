const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/search
 * Global cross-entity search across Users, Numbers, Rentals, Messages, and Audit Logs
 */
router.get('/', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const queryTerm = q.trim();

    if (!queryTerm || queryTerm.length < 2) {
      return res.json({ results: { users: [], numbers: [], rentals: [], messages: [], logs: [] } });
    }

    const term = `%${queryTerm.toLowerCase()}%`;

    // 1. Users
    const usersRes = await db.query(
      `SELECT id, name, email, company_name, role, status, balance FROM users
       WHERE LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(company_name) LIKE $1
       LIMIT 5`,
      [term]
    );

    // 2. Numbers
    const numbersRes = await db.query(
      `SELECT id, e164_format, friendly_name, country_code, number_type, status, provider FROM phone_numbers
       WHERE e164_format LIKE $1 OR LOWER(friendly_name) LIKE $1
       LIMIT 5`,
      [term]
    );

    // 3. Rentals
    const rentalsRes = await db.query(
      `SELECT r.id, r.phone_number, r.status, r.rental_plan, u.email as user_email
       FROM rentals r
       JOIN users u ON r.user_id = u.id
       WHERE r.phone_number LIKE $1 OR LOWER(u.email) LIKE $1
       LIMIT 5`,
      [term]
    );

    // 4. Messages
    const messagesRes = await db.query(
      `SELECT m.id, m.from_number, m.to_number, m.body, m.extracted_code, m.received_at, u.email as user_email
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.to_number LIKE $1 OR m.from_number LIKE $1 OR LOWER(m.body) LIKE $1
       LIMIT 5`,
      [term]
    );

    res.json({
      query: queryTerm,
      results: {
        users: usersRes.rows,
        numbers: numbersRes.rows,
        rentals: rentalsRes.rows,
        messages: messagesRes.rows
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
