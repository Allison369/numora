const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getTelephonyProvider } = require('../services/telephony');
const sseService = require('../services/sseService');

/**
 * Helper to extract verification codes (OTP, 2FA, PIN) from message text
 */
function extractVerificationCode(text) {
  if (!text) return null;

  // Pattern 1: explicitly identified code (e.g. "code is 123456", "OTP: 9821", "use token 492041")
  const explicitMatch = text.match(/(?:code|pin|otp|passcode|token|verification|código|код)[:\s-]+([0-9]{4,8})/i);
  if (explicitMatch && explicitMatch[1]) {
    return explicitMatch[1];
  }

  // Pattern 2: isolated 4-8 digit number sequence
  const standaloneMatch = text.match(/\b([0-9]{4,8})\b/);
  if (standaloneMatch && standaloneMatch[1]) {
    return standaloneMatch[1];
  }

  return null;
}

/**
 * POST /api/webhooks/telephony/inbound-sms
 * Primary carrier webhook receiving incoming SMS from Twilio, Telnyx, or Mock
 */
router.post('/inbound-sms', async (req, res) => {
  const provider = getTelephonyProvider();

  try {
    const parsed = provider.parseInboundWebhook(req);
    const toNumber = (parsed.to || '').trim();
    const fromNumber = (parsed.from || '').trim();
    const body = (parsed.body || '').trim();
    const messageId = parsed.messageId || `msg_${Date.now()}`;

    console.log(`[Telephony Webhook] Received SMS on ${toNumber} from ${fromNumber}: "${body.slice(0, 50)}..."`);

    if (!toNumber) {
      return res.status(400).send('Missing destination phone number');
    }

    // Look up active rental for this number
    const rentalRes = await db.query(
      `SELECT r.*, u.email as user_email
       FROM rentals r
       JOIN users u ON r.user_id = u.id
       WHERE r.phone_number = $1 AND r.status = 'active'
       ORDER BY r.starts_at DESC LIMIT 1`,
      [toNumber]
    );

    if (rentalRes.rows.length === 0) {
      console.warn(`[Telephony Webhook] No active rental found for number ${toNumber}. Message dropped or unassigned.`);
      // Return 200 OK so carrier does not endlessly retry
      return res.type('text/xml').send('<Response></Response>');
    }

    const rental = rentalRes.rows[0];
    const extractedCode = extractVerificationCode(body);

    // Save message to database
    const insertRes = await db.query(
      `INSERT INTO messages (rental_id, user_id, direction, from_number, to_number, body, extracted_code, provider, provider_message_id, raw_payload)
       VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [rental.id, rental.user_id, fromNumber, toNumber, body, extractedCode, provider.name, messageId, JSON.stringify(parsed.raw)]
    );
    const savedMessage = insertRes.rows[0];

    console.log(`[Telephony Webhook] Routed SMS to User ${rental.user_id} (${rental.user_email}). Extracted OTP: ${extractedCode || 'None'}`);

    // Push real-time event to customer's active web session via SSE
    sseService.sendToUser(rental.user_id, 'new_sms', {
      message: savedMessage,
      rentalId: rental.id,
      phoneNumber: rental.phone_number
    });

    // If customer configured a custom developer webhook URL, forward payload asynchronously
    if (rental.webhook_url && rental.webhook_url.startsWith('http')) {
      fetch(rental.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TeleRent-Webhook-Forwarder/1.0' },
        body: JSON.stringify({
          event: 'sms.received',
          id: savedMessage.id,
          to: toNumber,
          from: fromNumber,
          body: body,
          code: extractedCode,
          received_at: savedMessage.received_at
        })
      }).catch(err => {
        console.warn(`[Webhook Forwarder] Failed to forward to customer endpoint ${rental.webhook_url}:`, err.message);
      });
    }

    // Acknowledge carrier with blank TwiML or JSON
    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    console.error('[Telephony Webhook Error]:', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /api/webhooks/telephony/inbound-voice
 * Voice webhook handler (plays standard greeting or forward)
 */
router.post('/inbound-voice', (req, res) => {
  res.type('text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>
     <Response>
       <Say voice="alice">Thank you for calling. This number is powered by TeleRent.</Say>
       <Pause length="1"/>
       <Say voice="alice">Good bye.</Say>
     </Response>`
  );
});

module.exports = router;
