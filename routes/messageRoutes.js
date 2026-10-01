const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const db = require('../config/database');
const config = require('../config/config');
const sseService = require('../services/sseService');

/**
 * GET /api/messages/stream
 * Real-time Server-Sent Events endpoint for instant inbound SMS
 */
router.get('/stream', async (req, res) => {
  // Support token via query parameter or header for EventSource compatibility
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Auth token required for stream' });
  }

  let userId;
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, timestamp: new Date() })}\n\n`);

  sseService.addClient(userId, res);

  // Heartbeat every 20 seconds to prevent reverse proxy timeouts
  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// All other endpoints require standard header authentication
router.use(authMiddleware);

/**
 * GET /api/messages
 * List received SMS
 */
router.get('/', async (req, res) => {
  try {
    const { rentalId, limit = 50, offset = 0 } = req.query;

    let queryText = `
      SELECT m.*, r.phone_number as rental_phone_number, p.friendly_name
      FROM messages m
      LEFT JOIN rentals r ON m.rental_id = r.id
      LEFT JOIN phone_numbers p ON r.phone_number_id = p.id
      WHERE m.user_id = $1
    `;
    const params = [req.user.id];

    if (rentalId) {
      params.push(rentalId);
      queryText += ` AND m.rental_id = $${params.length}`;
    }

    queryText += ` ORDER BY m.received_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(queryText, params);

    res.json({
      messages: result.rows.map(m => ({
        id: m.id,
        rentalId: m.rental_id,
        from: m.from_number,
        to: m.to_number,
        body: m.body,
        code: m.extracted_code,
        direction: m.direction,
        isRead: m.is_read,
        receivedAt: m.received_at,
        provider: m.provider
      }))
    });
  } catch (err) {
    console.error('[Get Messages Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/messages/:id/read
 * Mark message as read
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE messages SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id, is_read',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: 'Marked as read', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/messages/mark-all-read
 * Mark all user messages as read
 */
router.patch('/mark-all-read', async (req, res) => {
  try {
    await db.query('UPDATE messages SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'All messages marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
