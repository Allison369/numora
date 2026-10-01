const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/settings
 * Fetch all platform settings (masks sensitive API keys)
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM system_settings ORDER BY category ASC, key ASC');

    const settings = result.rows.map(s => {
      let val = s.value;
      // Mask sensitive keys
      if (s.is_sensitive && typeof val === 'string' && val.length > 4) {
        val = val.slice(0, 4) + '••••••••••••••••';
      }
      return {
        key: s.key,
        value: val,
        category: s.category,
        description: s.description,
        isSensitive: s.is_sensitive,
        updatedAt: s.updated_at
      };
    });

    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/settings
 * Update settings with audit trail
 */
router.put('/', async (req, res) => {
  try {
    const { settings } = req.body; // Array of { key, value }
    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ error: 'Settings array is required' });
    }

    for (const item of settings) {
      if (item.key && item.value !== undefined) {
        // Skip masked sensitive fields that weren't modified
        if (typeof item.value === 'string' && item.value.includes('••••')) {
          continue;
        }

        await db.query(
          `UPDATE system_settings
           SET value = $1::jsonb, updated_by = $2, updated_at = NOW()
           WHERE key = $3`,
          [JSON.stringify(item.value), req.admin.id, item.key]
        );
      }
    }

    await logAudit(req.admin.id, req.admin.email, 'settings.update', 'settings', 'bulk', req, {
      updatedKeys: settings.map(s => s.key)
    }, 'success');

    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/settings/emergency-lock
 * Emergency Toggle: Maintenance Mode or Security Lockdown
 */
router.post('/emergency-lock', async (req, res) => {
  try {
    const { mode, enabled } = req.body; // mode: 'maintenance_mode' or 'security_lockdown'
    if (mode !== 'maintenance_mode' && mode !== 'security_lockdown') {
      return res.status(400).json({ error: 'Invalid emergency mode' });
    }

    await db.query(
      `UPDATE system_settings
       SET value = $1::jsonb, updated_by = $2, updated_at = NOW()
       WHERE key = $3`,
      [JSON.stringify(Boolean(enabled)), req.admin.id, mode]
    );

    await logAudit(req.admin.id, req.admin.email, `emergency.${mode}_toggle`, 'security', mode, req, {
      mode,
      enabled: Boolean(enabled)
    }, 'warning');

    res.json({ message: `Emergency control ${mode} set to ${Boolean(enabled)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
