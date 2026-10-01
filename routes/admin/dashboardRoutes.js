const express = require('express');
const router = express.Router();
const os = require('os');
const db = require('../../config/database');
const { superAdminMiddleware } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/dashboard/stats
 * Aggregates complete platform-wide statistics for the Super Admin overview
 */
router.get('/stats', async (req, res) => {
  try {
    // 1. User metrics
    const userStats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE status = 'active') as active_users,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d,
        COUNT(*) FILTER (WHERE role = 'super_admin' OR role = 'admin') as admin_users
      FROM users
    `);

    // 2. Inventory & Rental metrics
    const numStats = await db.query(`
      SELECT 
        COUNT(*) as total_numbers,
        COUNT(*) FILTER (WHERE status = 'available') as available_numbers,
        COUNT(*) FILTER (WHERE status = 'rented') as rented_numbers,
        COALESCE(SUM(cost_price_monthly), 0) as total_monthly_cost
      FROM phone_numbers
    `);

    const rentalStats = await db.query(`
      SELECT 
        COUNT(*) as total_rentals_all_time,
        COUNT(*) FILTER (WHERE status = 'active') as active_rentals,
        COUNT(*) FILTER (WHERE status = 'expired') as expired_rentals,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_rentals,
        COALESCE(SUM(price_paid) FILTER (WHERE status = 'active'), 0) as active_rental_mrr
      FROM rentals
    `);

    // 3. Message & SMS metrics
    const messageStats = await db.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE extracted_code IS NOT NULL) as total_otp_extracted,
        COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours') as messages_24h
      FROM messages
    `);

    // 4. Financial & Ledger metrics
    const financeStats = await db.query(`
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE type = 'deposit'), 0) as total_deposits,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE type IN ('rental_purchase', 'rental_renewal')), 0) as total_rental_revenue,
        COALESCE(SUM(balance), 0) as total_user_wallet_liability
      FROM users u
      LEFT JOIN transactions t ON true
    `);

    // 5. Recent 7-Day Growth Timeline (for charts)
    const timelineRes = await db.query(`
      SELECT 
        to_char(date_trunc('day', d), 'YYYY-MM-DD') as day,
        COALESCE(COUNT(DISTINCT r.id), 0) as rentals_count,
        COALESCE(COUNT(DISTINCT m.id), 0) as messages_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'deposit'), 0) as deposit_volume
      FROM generate_series(NOW() - INTERVAL '6 days', NOW(), '1 day'::interval) d
      LEFT JOIN rentals r ON date_trunc('day', r.created_at) = date_trunc('day', d)
      LEFT JOIN messages m ON date_trunc('day', m.received_at) = date_trunc('day', d)
      LEFT JOIN transactions t ON date_trunc('day', t.created_at) = date_trunc('day', d)
      GROUP BY d
      ORDER BY d ASC
    `);

    // 6. Recent Audit Events & Alerts
    const recentAudit = await db.query(`
      SELECT id, admin_email, action, entity_type, entity_id, status, created_at, details
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 8
    `);

    const alerts = await db.query(`
      SELECT id, type, title, message, severity, is_read, created_at
      FROM admin_notifications
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // System health summary
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsagePct = Math.round(((totalMem - freeMem) / totalMem) * 100);

    const u = userStats.rows[0];
    const n = numStats.rows[0];
    const r = rentalStats.rows[0];
    const m = messageStats.rows[0];
    const f = financeStats.rows[0];

    const grossRevenue = parseFloat(f.total_rental_revenue || '0');
    const estCost = parseFloat(n.total_monthly_cost || '0');
    const netProfit = Math.max(0, grossRevenue - estCost);
    const profitMargin = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 100) : 76;

    res.json({
      metrics: {
        users: {
          total: parseInt(u.total_users, 10),
          active: parseInt(u.active_users, 10),
          suspended: parseInt(u.suspended_users, 10),
          new7d: parseInt(u.new_users_7d, 10),
          admins: parseInt(u.admin_users, 10)
        },
        inventory: {
          total: parseInt(n.total_numbers, 10),
          available: parseInt(n.available_numbers, 10),
          rented: parseInt(n.rented_numbers, 10),
          utilizationRate: n.total_numbers > 0 ? Math.round((n.rented_numbers / n.total_numbers) * 100) : 0
        },
        rentals: {
          active: parseInt(r.active_rentals, 10),
          expired: parseInt(r.expired_rentals, 10),
          allTime: parseInt(r.total_rentals_all_time, 10),
          mrr: parseFloat(r.active_rental_mrr)
        },
        messaging: {
          total: parseInt(m.total_messages, 10),
          otpExtracted: parseInt(m.total_otp_extracted, 10),
          last24h: parseInt(m.messages_24h, 10)
        },
        financials: {
          totalDeposits: parseFloat(f.total_deposits || '0'),
          rentalRevenue: grossRevenue,
          carrierCost: estCost,
          netProfit: netProfit,
          profitMarginPct: profitMargin,
          walletLiability: parseFloat(f.total_user_wallet_liability || '0')
        }
      },
      system: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryUsagePercent: memUsagePct,
        activeDbPoolClients: db.pool.totalCount,
        idleDbPoolClients: db.pool.idleCount,
        nodeVersion: process.version,
        platform: process.platform
      },
      chartTimeline: timelineRes.rows,
      recentAuditLogs: recentAudit.rows,
      recentAlerts: alerts.rows
    });
  } catch (err) {
    console.error('[Admin Dashboard Stats Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
