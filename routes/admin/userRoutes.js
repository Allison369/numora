const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/users
 * Search, filter, sort, and paginate users
 */
router.get('/', async (req, res) => {
  try {
    const { search = '', role = '', status = '', page = 1, limit = 20, sort = 'created_at', order = 'DESC' } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const validSortCols = ['name', 'email', 'balance', 'role', 'status', 'created_at', 'last_login_at'];
    const sortCol = validSortCols.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClauses = ['1=1'];
    let params = [];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(company_name) LIKE $${params.length})`);
    }

    if (role.trim()) {
      params.push(role.trim());
      whereClauses.push(`role = $${params.length}`);
    }

    if (status.trim()) {
      params.push(status.trim());
      whereClauses.push(`status = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count query
    const countRes = await db.query(`SELECT COUNT(*) FROM users WHERE ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    // Data query with aggregated rental and message counts
    const dataQuery = `
      SELECT 
        u.id, u.email, u.name, u.company_name, u.balance, u.currency, u.role, u.status,
        u.two_factor_enabled, u.last_login_at, u.created_at,
        (SELECT COUNT(*) FROM rentals r WHERE r.user_id = u.id AND r.status = 'active') as active_rentals_count,
        (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) as messages_count
      FROM users u
      WHERE ${whereStr}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(parseInt(limit, 10), offset);
    const dataRes = await db.query(dataQuery, params);

    res.json({
      users: dataRes.rows.map(u => ({
        ...u,
        balance: parseFloat(u.balance),
        activeRentalsCount: parseInt(u.active_rentals_count, 10),
        messagesCount: parseInt(u.messages_count, 10)
      })),
      pagination: {
        total: totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('[Admin Get Users Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/users/:id
 * Fetch complete user profile with active rentals and transaction ledger
 */
router.get('/:id', async (req, res) => {
  try {
    const userRes = await db.query(
      `SELECT id, email, name, company_name, balance, currency, role, status,
              two_factor_enabled, last_login_at, last_login_ip, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    user.balance = parseFloat(user.balance);

    // Rentals
    const rentalsRes = await db.query(
      `SELECT r.*, p.friendly_name, p.country_code, p.number_type
       FROM rentals r
       JOIN phone_numbers p ON r.phone_number_id = p.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [user.id]
    );

    // Recent Transactions
    const transRes = await db.query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [user.id]
    );

    // Recent Audit Actions on this user
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE entity_id = $1 OR admin_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [user.id]
    );

    res.json({
      user,
      rentals: rentalsRes.rows,
      transactions: transRes.rows.map(t => ({ ...t, amount: parseFloat(t.amount), balanceAfter: parseFloat(t.balance_after) })),
      auditHistory: auditRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users
 * Create a new user account as Super Admin
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, password, companyName, role = 'customer', balance = 0, status = 'active' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const balanceNum = parseFloat(balance) || 0;

    const insertRes = await db.query(
      `INSERT INTO users (name, email, password_hash, company_name, role, balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, company_name, balance, role, status, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, companyName ? companyName.trim() : null, role, balanceNum, status]
    );

    const newUser = insertRes.rows[0];

    if (balanceNum > 0) {
      await db.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
         VALUES ($1, 'deposit', $2, $2, 'Initial balance grant by Administrator', 'completed')`,
        [newUser.id, balanceNum]
      );
    }

    await logAudit(req.admin.id, req.admin.email, 'user.create', 'user', newUser.id, req, {
      createdEmail: newUser.email,
      assignedRole: newUser.role,
      initialBalance: balanceNum
    }, 'success');

    res.status(201).json({
      message: 'User account created successfully',
      user: { ...newUser, balance: parseFloat(newUser.balance) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/users/:id
 * Edit user profile, role, status
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, email, companyName, role, status } = req.body;

    // Safety check: Prevent demoting the last super_admin
    if (role && role !== 'super_admin') {
      const superAdminCountRes = await db.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
      const isTargetSuperAdmin = await db.query("SELECT role FROM users WHERE id = $1", [req.params.id]);

      if (isTargetSuperAdmin.rows[0]?.role === 'super_admin' && parseInt(superAdminCountRes.rows[0].count, 10) <= 1) {
        return res.status(400).json({ error: 'Cannot remove role from the only remaining Super Administrator.' });
      }
    }

    const updateRes = await db.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           company_name = COALESCE($3, company_name),
           role = COALESCE($4, role),
           status = COALESCE($5, status),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, email, company_name, role, status, balance, updated_at`,
      [name, email ? email.toLowerCase().trim() : null, companyName, role, status, req.params.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = updateRes.rows[0];

    await logAudit(req.admin.id, req.admin.email, 'user.update', 'user', updatedUser.id, req, {
      updates: { name, email, companyName, role, status }
    }, 'success');

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/:id/balance
 * Manually adjust user account balance (Credit or Debit)
 */
router.post('/:id/balance', async (req, res) => {
  try {
    const { amount, type = 'credit', reason = 'Admin balance adjustment' } = req.body;
    const delta = parseFloat(amount);

    if (isNaN(delta) || delta <= 0) {
      return res.status(400).json({ error: 'Invalid adjustment amount' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT id, email, balance FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (userRes.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userRes.rows[0];
      const curBal = parseFloat(user.balance);
      const adjustment = type === 'debit' ? -delta : delta;
      const newBal = curBal + adjustment;

      if (newBal < 0) {
        throw new Error(`Debit of $${delta.toFixed(2)} exceeds current user balance ($${curBal.toFixed(2)})`);
      }

      await client.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2', [newBal, user.id]);

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, status)
         VALUES ($1, $2, $3, $4, $5, 'completed')`,
        [user.id, type === 'debit' ? 'refund' : 'deposit', adjustment, newBal, `${reason} (Admin: ${req.admin.email})`]
      );

      await client.query('COMMIT');

      await logAudit(req.admin.id, req.admin.email, 'user.balance_adjust', 'user', user.id, req, {
        previousBalance: curBal,
        adjustedBy: adjustment,
        newBalance: newBal,
        reason
      }, 'success');

      res.json({
        message: `Successfully adjusted balance by ${adjustment > 0 ? '+' : ''}$${adjustment.toFixed(2)}`,
        newBalance: newBal
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password as Super Admin
 */
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const updateRes = await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email',
      [hash, req.params.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAudit(req.admin.id, req.admin.email, 'user.reset_password', 'user', req.params.id, req, {
      targetEmail: updateRes.rows[0].email
    }, 'success');

    res.json({ message: 'User password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user account with safety checks
 */
router.delete('/:id', async (req, res) => {
  try {
    // Safety check 1: Cannot delete oneself
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ error: 'Safety protection: You cannot delete your own Super Admin account.' });
    }

    // Safety check 2: Cannot delete the only super admin
    const targetRes = await db.query('SELECT role, email FROM users WHERE id = $1', [req.params.id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = targetRes.rows[0];
    if (targetUser.role === 'super_admin') {
      const superCount = await db.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
      if (parseInt(superCount.rows[0].count, 10) <= 1) {
        return res.status(400).json({ error: 'Safety protection: Cannot delete the only remaining Super Administrator.' });
      }
    }

    // Release all active rentals first
    await db.query(
      `UPDATE phone_numbers SET status = 'available', current_rental_id = NULL
       WHERE current_rental_id IN (SELECT id FROM rentals WHERE user_id = $1)`,
      [req.params.id]
    );

    // Delete user (cascades to rentals, messages, transactions)
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    await logAudit(req.admin.id, req.admin.email, 'user.delete', 'user', req.params.id, req, {
      deletedEmail: targetUser.email,
      deletedRole: targetUser.role
    }, 'warning');

    res.json({ message: `User ${targetUser.email} deleted successfully and active numbers released.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/bulk-action
 * Bulk activate, suspend, or delete users
 */
router.post('/bulk-action', async (req, res) => {
  try {
    const { userIds, action } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'No user IDs provided' });
    }

    // Filter out current admin ID from destructive bulk actions
    const filteredIds = userIds.filter(id => id !== req.admin.id);

    if (action === 'suspend') {
      await db.query(`UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = ANY($1)`, [filteredIds]);
    } else if (action === 'activate') {
      await db.query(`UPDATE users SET status = 'active', updated_at = NOW() WHERE id = ANY($1)`, [filteredIds]);
    } else if (action === 'delete') {
      await db.query(`DELETE FROM users WHERE id = ANY($1) AND role != 'super_admin'`, [filteredIds]);
    } else {
      return res.status(400).json({ error: 'Invalid bulk action' });
    }

    await logAudit(req.admin.id, req.admin.email, `user.bulk_${action}`, 'user', 'bulk', req, {
      affectedCount: filteredIds.length,
      action
    }, 'warning');

    res.json({ message: `Bulk action '${action}' applied to ${filteredIds.length} user(s).` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
