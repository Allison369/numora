const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/billing/transactions
 * Global financial ledger
 */
router.get('/transactions', async (req, res) => {
  try {
    const { type = '', search = '', limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClauses = ['1=1'];
    let params = [];

    if (type) {
      params.push(type);
      whereClauses.push(`t.type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(LOWER(u.email) LIKE $${params.length} OR LOWER(u.name) LIKE $${params.length} OR LOWER(t.description) LIKE $${params.length})`);
    }

    const query = `
      SELECT t.*, u.email as user_email, u.name as user_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY t.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit, 10), offset);
    const result = await db.query(query, params);

    res.json({
      transactions: result.rows.map(t => ({
        id: t.id,
        userId: t.user_id,
        userEmail: t.user_email,
        userName: t.user_name,
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

module.exports = router;
