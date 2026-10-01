const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/rentals
 * List all global customer rentals
 */
router.get('/', async (req, res) => {
  try {
    const { status = '', search = '' } = req.query;

    let whereClauses = ['1=1'];
    let params = [];

    if (status) {
      params.push(status);
      whereClauses.push(`r.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(r.phone_number LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR LOWER(u.name) LIKE $${params.length})`);
    }

    const query = `
      SELECT r.*, u.email as user_email, u.name as user_name, u.company_name as user_company,
             p.country_code, p.number_type, p.provider,
             (SELECT COUNT(*) FROM messages m WHERE m.rental_id = r.id) as message_count
      FROM rentals r
      JOIN users u ON r.user_id = u.id
      JOIN phone_numbers p ON r.phone_number_id = p.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY r.created_at DESC
    `;

    const result = await db.query(query, params);

    res.json({
      rentals: result.rows.map(r => ({
        id: r.id,
        phoneNumber: r.phone_number,
        userId: r.user_id,
        userEmail: r.user_email,
        userName: r.user_name,
        userCompany: r.user_company,
        countryCode: r.country_code,
        numberType: r.number_type,
        provider: r.provider,
        plan: r.rental_plan,
        pricePaid: parseFloat(r.price_paid),
        autoRenew: r.auto_renew,
        status: r.status,
        webhookUrl: r.webhook_url,
        startsAt: r.starts_at,
        expiresAt: r.expires_at,
        cancelledAt: r.cancelled_at,
        messageCount: parseInt(r.message_count, 10),
        isExpired: new Date(r.expires_at) <= new Date()
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/rentals/:id/extend
 * Force extend lease duration
 */
router.post('/:id/extend', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const addDays = parseInt(days, 10) || 30;

    const rentalRes = await db.query('SELECT * FROM rentals WHERE id = $1', [req.params.id]);
    if (rentalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    const rental = rentalRes.rows[0];

    const currentExpiry = new Date(rental.expires_at) > new Date() ? new Date(rental.expires_at) : new Date();
    const newExpiresAt = new Date(currentExpiry.getTime() + addDays * 24 * 60 * 60 * 1000);

    await db.query(
      `UPDATE rentals SET expires_at = $1, status = 'active', updated_at = NOW() WHERE id = $2`,
      [newExpiresAt, rental.id]
    );

    await db.query(
      `UPDATE phone_numbers SET status = 'rented', current_rental_id = $1 WHERE id = $2`,
      [rental.id, rental.phone_number_id]
    );

    await logAudit(req.admin.id, req.admin.email, 'rental.force_extend', 'rental', rental.id, req, {
      phoneNumber: rental.phone_number,
      addedDays: addDays,
      newExpiresAt
    }, 'success');

    res.json({ message: `Lease extended by ${addDays} days`, expiresAt: newExpiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/rentals/:id/cancel
 * Force terminate rental
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const rentalRes = await db.query('SELECT * FROM rentals WHERE id = $1', [req.params.id]);
    if (rentalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    const rental = rentalRes.rows[0];

    await db.query("UPDATE rentals SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1", [rental.id]);
    await db.query("UPDATE phone_numbers SET status = 'available', current_rental_id = NULL WHERE id = $1", [rental.phone_number_id]);

    await logAudit(req.admin.id, req.admin.email, 'rental.force_cancel', 'rental', rental.id, req, {
      phoneNumber: rental.phone_number
    }, 'warning');

    res.json({ message: `Rental for ${rental.phone_number} terminated.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/rentals/messages
 * Inspect all platform SMS messages and raw carrier webhook payloads
 */
router.get('/messages', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClauses = ['1=1'];
    let params = [];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(m.to_number LIKE $${params.length} OR m.from_number LIKE $${params.length} OR LOWER(m.body) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
    }

    const query = `
      SELECT m.*, u.email as user_email, u.name as user_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY m.received_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit, 10), offset);
    const result = await db.query(query, params);

    res.json({
      messages: result.rows.map(m => ({
        id: m.id,
        from: m.from_number,
        to: m.to_number,
        body: m.body,
        code: m.extracted_code,
        direction: m.direction,
        userEmail: m.user_email,
        userName: m.user_name,
        provider: m.provider,
        rawPayload: m.raw_payload,
        receivedAt: m.received_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
