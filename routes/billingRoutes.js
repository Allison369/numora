const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../config/database');
const config = require('../config/config');

let stripe = null;
if (config.stripe.secretKey) {
  stripe = require('stripe')(config.stripe.secretKey);
}

/**
 * Public Stripe Webhook Endpoint (no JWT auth header)
 */
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !config.stripe.webhookSecret) {
    return res.status(400).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook Signature Error]:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const amount = (session.amount_total || 0) / 100; // in dollars

    if (userId && amount > 0) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length > 0) {
          const newBal = parseFloat(userRes.rows[0].balance) + amount;
          await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2', [newBal, userId]);
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, reference_id, description, status)
             VALUES ($1, 'deposit', $2, $3, $4, 'Stripe Card Deposit', 'completed')`,
            [userId, amount, newBal, session.id]
          );
          await client.query('COMMIT');
          console.log(`[Stripe Webhook] Credited $${amount} to user ${userId}`);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Stripe Credit Error]:', err);
      } finally {
        client.release();
      }
    }
  }

  res.json({ received: true });
});

// All following routes require authentication
router.use(authMiddleware);

/**
 * GET /api/billing/balance
 */
router.get('/balance', async (req, res) => {
  try {
    const userRes = await db.query('SELECT balance, currency FROM users WHERE id = $1', [req.user.id]);
    res.json({
      balance: parseFloat(userRes.rows[0].balance),
      currency: userRes.rows[0].currency
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );

    res.json({
      transactions: result.rows.map(t => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        balanceAfter: parseFloat(t.balance_after),
        description: t.description,
        status: t.status,
        createdAt: t.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/billing/deposit
 * Instant balance top-up (simulated card payment or wallet deposit)
 */
router.post('/deposit', async (req, res) => {
  try {
    const { amount, paymentMethod = 'card' } = req.body;
    const depositAmount = parseFloat(amount);

    if (isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid deposit amount greater than $0' });
    }

    if (depositAmount > 500) {
      return res.status(400).json({ error: 'Single deposit limit is $500.00' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      const currentBalance = parseFloat(userRes.rows[0].balance);
      const newBalance = currentBalance + depositAmount;

      await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2', [newBalance, req.user.id]);

      const transRes = await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
         VALUES ($1, 'deposit', $2, $3, $4, 'completed') RETURNING *`,
        [req.user.id, depositAmount, newBalance, `Account Top-Up (${paymentMethod.toUpperCase()})`]
      );

      await client.query('COMMIT');

      res.json({
        message: `Successfully topped up $${depositAmount.toFixed(2)}!`,
        newBalance: newBalance,
        transaction: transRes.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Deposit Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/billing/create-checkout-session
 * Creates Stripe Checkout Session for live credit card processing
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        error: 'Stripe is not configured with an API key. You can use Instant Top-Up to add demo funds immediately.'
      });
    }

    const { amount } = req.body;
    const depositAmount = parseFloat(amount);

    if (isNaN(depositAmount) || depositAmount < 5) {
      return res.status(400).json({ error: 'Minimum deposit is $5.00' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'TeleRent Account Balance Top-Up',
              description: `Add $${depositAmount.toFixed(2)} credits for renting phone numbers`
            },
            unit_amount: Math.round(depositAmount * 100)
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      success_url: `${config.baseUrl}/app.html?deposit_success=true&amount=${depositAmount}`,
      cancel_url: `${config.baseUrl}/app.html?deposit_cancelled=true`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe Session Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
