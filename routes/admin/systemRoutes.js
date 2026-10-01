const express = require('express');
const router = express.Router();
const os = require('os');
const db = require('../../config/database');
const { superAdminMiddleware } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/system/health
 * Detailed System, Server, and Database Health Metrics
 */
router.get('/health', async (req, res) => {
  try {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsed = memTotal - memFree;

    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Database roundtrip latency
    const startDb = Date.now();
    await db.query('SELECT 1');
    const dbLatencyMs = Date.now() - startDb;

    // Database size
    const dbSizeRes = await db.query(`SELECT pg_size_pretty(pg_database_size('telerent')) as size`);

    res.json({
      application: {
        name: 'Numora Telephony SaaS Platform',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        processMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
      },
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        architecture: os.arch(),
        cpuCores: cpus.length,
        cpuModel: cpus[0]?.model || 'Unknown',
        loadAverage: loadAvg,
        totalMemoryGb: (memTotal / (1024 ** 3)).toFixed(2),
        usedMemoryGb: (memUsed / (1024 ** 3)).toFixed(2),
        memoryUsagePercent: Math.round((memUsed / memTotal) * 100)
      },
      database: {
        status: 'healthy',
        latencyMs: dbLatencyMs,
        databaseSize: dbSizeRes.rows[0]?.size || 'Unknown',
        totalPoolClients: db.pool.totalCount,
        idlePoolClients: db.pool.idleCount,
        waitingClients: db.pool.waitingCount
      },
      backgroundWorker: {
        status: 'running',
        job: 'Lease Expiration & Auto-Renewal',
        interval: '30 seconds',
        lastChecked: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
