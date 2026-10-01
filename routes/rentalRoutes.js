const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rentalManager = require('../services/rentalManager');
const db = require('../config/database');

router.use(authMiddleware);

/**
 * POST /api/rentals
 * Rent a phone number
 */
router.post('/', async (req, res) => {
  try {
    const { phoneNumberId, plan = 'monthly', autoRenew = true, webhookUrl = null } = req.body;

    if (!phoneNumberId) {
      return res.status(400).json({ error: 'phoneNumberId is required' });
    }

    const result = await rentalManager.rentNumber(req.user.id, {
      phoneNumberId,
      plan,
      autoRenew,
      webhookUrl
    });

    res.status(201).json({
      message: 'Phone number successfully rented!',
      rental: result.rental,
      number: result.number,
      newBalance: result.newBalance
    });
  } catch (err) {
    console.error('[Rent Number Error]:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/rentals
 * List customer's rented numbers
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'all' } = req.query;

    let queryText = `
      SELECT r.*, p.friendly_name, p.country_code, p.number_type, p.capabilities,
             (SELECT COUNT(*) FROM messages m WHERE m.rental_id = r.id) as message_count,
             (SELECT COUNT(*) FROM messages m WHERE m.rental_id = r.id AND m.is_read = FALSE) as unread_count
      FROM rentals r
      JOIN phone_numbers p ON r.phone_number_id = p.id
      WHERE r.user_id = $1
    `;
    const params = [req.user.id];

    if (status !== 'all') {
      params.push(status);
      queryText += ` AND r.status = $${params.length}`;
    }

    queryText += ' ORDER BY r.created_at DESC';

    const result = await db.query(queryText, params);

    const rentals = result.rows.map(r => ({
      id: r.id,
      phoneNumberId: r.phone_number_id,
      phoneNumber: r.phone_number,
      friendlyName: r.friendly_name || r.phone_number,
      countryCode: r.country_code,
      numberType: r.number_type,
      capabilities: typeof r.capabilities === 'string' ? JSON.parse(r.capabilities) : r.capabilities,
      rentalPlan: r.rental_plan,
      pricePaid: parseFloat(r.price_paid),
      autoRenew: r.auto_renew,
      status: r.status,
      webhookUrl: r.webhook_url,
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      messageCount: parseInt(r.message_count, 10),
      unreadCount: parseInt(r.unread_count, 10),
      isExpired: new Date(r.expires_at) <= new Date()
    }));

    res.json({ rentals });
  } catch (err) {
    console.error('[Get Rentals Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rentals/:id/cancel
 * Cancel an active rental
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const result = await rentalManager.cancelRental(req.user.id, req.params.id);
    res.json({ message: 'Rental successfully cancelled', ...result });
  } catch (err) {
    console.error('[Cancel Rental Error]:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/rentals/:id/autorenew
 * Toggle auto-renew
 */
router.patch('/:id/autorenew', async (req, res) => {
  try {
    const { autoRenew } = req.body;
    const rental = await rentalManager.toggleAutoRenew(req.user.id, req.params.id, autoRenew);
    res.json({ message: 'Auto-renew preference updated', rental });
  } catch (err) {
    console.error('[Toggle AutoRenew Error]:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH /api/rentals/:id/webhook
 * Update developer forward webhook URL
 */
router.patch('/:id/webhook', async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    const updateRes = await db.query(
      'UPDATE rentals SET webhook_url = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [webhookUrl || null, req.params.id, req.user.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    res.json({ message: 'Webhook forwarding URL updated', rental: updateRes.rows[0] });
  } catch (err) {
    console.error('[Update Webhook Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
