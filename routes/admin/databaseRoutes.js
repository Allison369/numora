const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

// Whitelisted tables for safe admin inspection
const ALLOWED_TABLES = [
  'users',
  'phone_numbers',
  'rentals',
  'messages',
  'transactions',
  'roles',
  'permissions',
  'role_permissions',
  'audit_logs',
  'admin_notifications',
  'system_settings',
  'cms_content',
  'media_files',
  'user_sessions'
];

/**
 * GET /api/admin/database/tables
 * Overview of all application database tables
 */
router.get('/tables', async (req, res) => {
  try {
    const tablesRes = await db.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count,
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as total_size
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `);

    // Get live accurate count for each whitelisted table
    const tablesWithCounts = await Promise.all(
      tablesRes.rows.map(async (row) => {
        let count = 0;
        try {
          if (ALLOWED_TABLES.includes(row.table_name)) {
            const countQuery = await db.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
            count = parseInt(countQuery.rows[0].count, 10);
          }
        } catch {}
        return {
          tableName: row.table_name,
          columnCount: parseInt(row.column_count, 10),
          rowCount: count,
          totalSize: row.total_size,
          isInspectable: ALLOWED_TABLES.includes(row.table_name)
        };
      })
    );

    res.json({ tables: tablesWithCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/database/records
 * Safe parameterized record viewer for any whitelisted table
 */
router.get('/records', async (req, res) => {
  try {
    const { table, page = 1, limit = 25, search = '' } = req.query;

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return res.status(400).json({ error: 'Invalid or unauthorized table name' });
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Get column schemas
    const colRes = await db.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns 
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position ASC`,
      [table]
    );
    const columns = colRes.rows;

    // Build query
    const countRes = await db.query(`SELECT COUNT(*) FROM "${table}"`);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    // Mask sensitive fields if viewing users or settings
    let selectFields = '*';
    if (table === 'users') {
      selectFields = 'id, email, name, company_name, balance, currency, role, status, two_factor_enabled, last_login_at, created_at, updated_at';
    }

    const recordsRes = await db.query(
      `SELECT ${selectFields} FROM "${table}" LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10), offset]
    );

    res.json({
      table,
      columns,
      records: recordsRes.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/database/export
 * Safe export of table records in JSON format
 */
router.get('/export', async (req, res) => {
  try {
    const { table } = req.query;
    if (!table || !ALLOWED_TABLES.includes(table)) {
      return res.status(400).json({ error: 'Invalid or unauthorized table name' });
    }

    let selectFields = '*';
    if (table === 'users') {
      selectFields = 'id, email, name, company_name, balance, currency, role, status, created_at';
    }

    const recordsRes = await db.query(`SELECT ${selectFields} FROM "${table}" LIMIT 1000`);

    await logAudit(req.admin.id, req.admin.email, 'database.export', 'database', table, req, {
      exportedCount: recordsRes.rows.length
    }, 'warning');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_export_${Date.now()}.json"`);
    res.send(JSON.stringify(recordsRes.rows, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
