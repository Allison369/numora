const express = require('express');
const router = express.Router();
const db = require('../config/database');
const sseService = require('../services/sseService');

// Same OTP extractor helper
function extractCode(text) {
  const m = text.match(/(?:code|pin|otp|passcode|token|verification)[:\s-]+([0-9]{4,8})/i) || text.match(/\b([0-9]{4,8})\b/);
  return m ? m[1] : null;
}

/**
 * POST /api/simulator/send-sms
 * Simulates an incoming SMS message from an external sender to any rented number
 */
router.post('/send-sms', async (req, res) => {
  try {
    const { toNumber, fromNumber = '+15559876543', body = 'Your verification code is 849201. Valid for 10 minutes.' } = req.body;

    if (!toNumber) {
      return res.status(400).json({ error: 'toNumber is required' });
    }

    // Find active rental
    const rentalRes = await db.query(
      `SELECT r.*, u.email as user_email
       FROM rentals r
       JOIN users u ON r.user_id = u.id
       WHERE r.phone_number = $1 AND r.status = 'active'`,
      [toNumber.trim()]
    );

    if (rentalRes.rows.length === 0) {
      return res.status(404).json({
        error: `No active customer rental found for number ${toNumber}. Message could not be routed.`
      });
    }

    const rental = rentalRes.rows[0];
    const code = extractCode(body);
    const mockSid = `sim_${Date.now()}`;

    const insertRes = await db.query(
      `INSERT INTO messages (rental_id, user_id, direction, from_number, to_number, body, extracted_code, provider, provider_message_id)
       VALUES ($1, $2, 'inbound', $3, $4, $5, $6, 'simulator', $7) RETURNING *`,
      [rental.id, rental.user_id, fromNumber.trim(), toNumber.trim(), body.trim(), code, mockSid]
    );

    const message = insertRes.rows[0];

    // Push live event via SSE
    sseService.sendToUser(rental.user_id, 'new_sms', {
      message,
      rentalId: rental.id,
      phoneNumber: rental.phone_number
    });

    res.json({
      success: true,
      message: 'Simulated incoming SMS successfully routed and delivered to customer inbox',
      data: message
    });
  } catch (err) {
    console.error('[Simulator Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
