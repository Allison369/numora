const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/audit/logs
 * Search and filter audit logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { search = '', action = '', status = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClauses = ['1=1'];
    let params = [];

    if (action) {
      params.push(action);
      whereClauses.push(`action = $${params.length}`);
    }
    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(LOWER(admin_email) LIKE $${params.length} OR action LIKE $${params.length} OR entity_type LIKE $${params.length} OR ip_address LIKE $${params.length})`);
    }

    const whereStr = whereClauses.join(' AND ');

    const countRes = await db.query(`SELECT COUNT(*) FROM audit_logs WHERE ${whereStr}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await db.query(
      `SELECT * FROM audit_logs WHERE ${whereStr} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      logs: dataRes.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/audit/notifications
 * List notifications
 */
router.get('/notifications', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM admin_notifications ORDER BY is_read ASC, created_at DESC LIMIT 50');
    res.json({ notifications: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/audit/notifications/:id/read
 * Mark notification as read
 */
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE admin_notifications SET is_read = TRUE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/audit/notifications/mark-all-read
 */
router.patch('/notifications/mark-all-read', async (req, res) => {
  try {
    await db.query('UPDATE admin_notifications SET is_read = TRUE');
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
