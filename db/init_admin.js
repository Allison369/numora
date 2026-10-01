const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function initializeAdminSystem() {
  console.log('[Admin Init] Applying Super Admin schema extensions...');
  const sql = fs.readFileSync(path.join(__dirname, 'schema_admin.sql'), 'utf-8');

  try {
    await db.query(sql);
    console.log('[Admin Init] Super Admin schema created successfully.');

    // 1. Seed Roles
    const roles = [
      { name: 'super_admin', display_name: 'Super Administrator', desc: 'Full unrestricted platform and owner-level control', is_system: true },
      { name: 'admin', display_name: 'Administrator', desc: 'Operational control over numbers, users, and content', is_system: true },
      { name: 'moderator', display_name: 'Moderator', desc: 'Content and message inspection and moderation', is_system: true },
      { name: 'support', display_name: 'Customer Support', desc: 'Read-only customer inspection and balance lookups', is_system: true },
      { name: 'customer', display_name: 'Regular Customer', desc: 'Standard number rental tenant', is_system: true }
    ];

    const roleMap = {};
    for (const r of roles) {
      const res = await db.query(
        `INSERT INTO roles (name, display_name, description, is_system)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET display_name = $2, description = $3
         RETURNING id, name`,
        [r.name, r.display_name, r.desc, r.is_system]
      );
      roleMap[r.name] = res.rows[0].id;
    }

    // 2. Seed Permissions
    const permissions = [
      { code: 'dashboard.view', category: 'General', desc: 'View admin dashboard statistics and financial metrics' },
      { code: 'users.view', category: 'User Management', desc: 'Inspect user accounts and profiles' },
      { code: 'users.manage', category: 'User Management', desc: 'Create, edit, suspend, balance adjustments, and delete users' },
      { code: 'roles.manage', category: 'Role Management', desc: 'Manage roles and security permissions' },
      { code: 'numbers.manage', category: 'Telephony', desc: 'Manage carrier inventory, pricing, and number provisioning' },
      { code: 'rentals.manage', category: 'Rentals', desc: 'View, extend, or force cancel customer leases' },
      { code: 'messages.view', category: 'Messages', desc: 'Inspect platform inbound/outbound SMS and raw carrier webhooks' },
      { code: 'billing.manage', category: 'Financial', desc: 'View transactions, process manual deposits and refunds' },
      { code: 'cms.manage', category: 'Content', desc: 'Create and edit announcements, pages, FAQs, and testimonials' },
      { code: 'media.manage', category: 'Media', desc: 'Upload, inspect, and delete media files' },
      { code: 'settings.manage', category: 'Settings', desc: 'Modify website configuration, telecom keys, and safety controls' },
      { code: 'database.inspect', category: 'Database', desc: 'Inspect raw database tables and export records' },
      { code: 'system.monitor', category: 'System', desc: 'Monitor server resources, connection pool, and error logs' },
      { code: 'audit.view', category: 'Audit', desc: 'Inspect complete platform audit logs and security events' }
    ];

    for (const p of permissions) {
      const pRes = await db.query(
        `INSERT INTO permissions (code, category, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET description = $3
         RETURNING id, code`,
        [p.code, p.category, p.desc]
      );

      // Assign all permissions to super_admin
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleMap['super_admin'], pRes.rows[0].id]
      );
    }

    // 3. Create or update the Super Admin account
    const superAdminEmail = 'superadmin@telerent.io';
    const superAdminPass = 'AdminPassword2026!';
    const passwordHash = await bcrypt.hash(superAdminPass, 12);

    const adminCheck = await db.query('SELECT id FROM users WHERE email = $1', [superAdminEmail]);
    let adminUserId;

    if (adminCheck.rows.length === 0) {
      const adminInsert = await db.query(
        `INSERT INTO users (email, password_hash, name, company_name, balance, currency, role, status)
         VALUES ($1, $2, 'Owner Super Admin', 'TeleRent HQ', 1000.0000, 'USD', 'super_admin', 'active')
         RETURNING id`,
        [superAdminEmail, passwordHash]
      );
      adminUserId = adminInsert.rows[0].id;
      console.log(`[Admin Init] Created Super Admin: ${superAdminEmail} / ${superAdminPass}`);
    } else {
      adminUserId = adminCheck.rows[0].id;
      await db.query(
        `UPDATE users SET password_hash = $1, role = 'super_admin', status = 'active', updated_at = NOW() WHERE id = $2`,
        [passwordHash, adminUserId]
      );
      console.log(`[Admin Init] Updated Super Admin: ${superAdminEmail} / ${superAdminPass}`);
    }

    // 4. Seed Default System Settings
    const defaultSettings = [
      { key: 'site_name', value: JSON.stringify('TeleRent Telephony Platform'), category: 'general', desc: 'Public platform branding name', is_sensitive: false },
      { key: 'support_email', value: JSON.stringify('support@telerent.io'), category: 'general', desc: 'Public support contact email', is_sensitive: false },
      { key: 'maintenance_mode', value: JSON.stringify(false), category: 'security', desc: 'Lock platform for maintenance', is_sensitive: false },
      { key: 'allow_registrations', value: JSON.stringify(true), category: 'security', desc: 'Allow public user sign-ups', is_sensitive: false },
      { key: 'security_lockdown', value: JSON.stringify(false), category: 'security', desc: 'Emergency lockdown mode (blocks non-admin access)', is_sensitive: false },
      { key: 'default_monthly_price', value: JSON.stringify(4.99), category: 'billing', desc: 'Default monthly retail number price in USD', is_sensitive: false },
      { key: 'default_weekly_price', value: JSON.stringify(1.99), category: 'billing', desc: 'Default weekly retail number price in USD', is_sensitive: false },
      { key: 'session_timeout_minutes', value: JSON.stringify(120), category: 'security', desc: 'Admin session inactivity timeout in minutes', is_sensitive: false },
      { key: 'max_login_attempts', value: JSON.stringify(5), category: 'security', desc: 'Max failed login attempts before lockout', is_sensitive: false },
      { key: 'require_admin_2fa', value: JSON.stringify(false), category: 'security', desc: 'Enforce two-factor authentication for admins', is_sensitive: false },
      { key: 'twilio_account_sid', value: JSON.stringify(''), category: 'telephony', desc: 'Twilio Account SID', is_sensitive: true },
      { key: 'twilio_auth_token', value: JSON.stringify(''), category: 'telephony', desc: 'Twilio Auth Token', is_sensitive: true },
      { key: 'telnyx_api_key', value: JSON.stringify(''), category: 'telephony', desc: 'Telnyx V2 API Key', is_sensitive: true }
    ];

    for (const s of defaultSettings) {
      await db.query(
        `INSERT INTO system_settings (key, value, category, description, is_sensitive, updated_by)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6)
         ON CONFLICT (key) DO NOTHING`,
        [s.key, s.value, s.category, s.desc, s.is_sensitive, adminUserId]
      );
    }

    // 5. Seed Initial CMS Content & FAQs
    const cmsItems = [
      {
        type: 'announcement',
        title: 'Global Carrier Capacity Expansion',
        slug: 'carrier-expansion-2026',
        content: 'We have added 50,000+ new non-VoIP and mobile numbers across UK, Canada, and Australia routes.',
        category: 'updates',
        is_published: true,
        sort_order: 1
      },
      {
        type: 'faq',
        title: 'How long are numbers leased for?',
        slug: 'faq-lease-duration',
        content: 'Numbers can be leased on a weekly (7-day) or monthly (30-day) basis with automatic renewal from your prepaid account balance.',
        category: 'rentals',
        is_published: true,
        sort_order: 2
      },
      {
        type: 'faq',
        title: 'Can I receive verification SMS & OTP codes?',
        slug: 'faq-otp-support',
        content: 'Yes! Our carrier routes support full incoming SMS reception with instant webhook delivery and automated OTP token parsing.',
        category: 'features',
        is_published: true,
        sort_order: 3
      }
    ];

    for (const c of cmsItems) {
      await db.query(
        `INSERT INTO cms_content (type, title, slug, content, category, is_published, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (slug) DO NOTHING`,
        [c.type, c.title, c.slug, c.content, c.category, c.is_published, c.sort_order, adminUserId]
      );
    }

    // 6. Record initial audit log
    await db.query(
      `INSERT INTO audit_logs (admin_id, admin_email, action, entity_type, entity_id, ip_address, details, status)
       VALUES ($1, $2, 'system.initialize', 'system', 'core', '127.0.0.1', '{"message": "Super Admin system successfully initialized and seeded"}', 'success')`,
      [adminUserId, superAdminEmail]
    );

    console.log('[Admin Init] Super Admin system ready!');
  } catch (err) {
    console.error('[Admin Init Error]:', err);
    throw err;
  }
}

if (require.main === module) {
  initializeAdminSystem()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = initializeAdminSystem;
