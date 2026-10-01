const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/roles
 * List all system roles with assigned permissions and user counts
 */
router.get('/', async (req, res) => {
  try {
    const rolesRes = await db.query(`
      SELECT r.id, r.name, r.display_name, r.description, r.is_system, r.created_at,
             (SELECT COUNT(*) FROM users u WHERE u.role = r.name) as user_count,
             COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'category', p.category, 'description', p.description)) 
               FILTER (WHERE p.id IS NOT NULL), '[]'::json) as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.created_at ASC
    `);

    res.json({ roles: rolesRes.rows.map(r => ({ ...r, userCount: parseInt(r.user_count, 10) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/roles/permissions
 * List all available system permissions categorized
 */
router.get('/permissions', async (req, res) => {
  try {
    const permRes = await db.query('SELECT * FROM permissions ORDER BY category ASC, code ASC');
    res.json({ permissions: permRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/roles
 * Create custom role
 */
router.post('/', async (req, res) => {
  try {
    const { name, displayName, description, permissionIds = [] } = req.body;
    if (!name || !displayName) {
      return res.status(400).json({ error: 'Role name and display name are required' });
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const insertRole = await db.query(
      `INSERT INTO roles (name, display_name, description, is_system)
       VALUES ($1, $2, $3, false) RETURNING *`,
      [cleanName, displayName, description]
    );
    const role = insertRole.rows[0];

    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      for (const pId of permissionIds) {
        await db.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [role.id, pId]
        );
      }
    }

    await logAudit(req.admin.id, req.admin.email, 'role.create', 'role', role.id, req, {
      roleName: role.name,
      permissionsCount: permissionIds.length
    }, 'success');

    res.status(201).json({ message: 'Role created successfully', role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/roles/:id
 * Update role permissions and description
 */
router.put('/:id', async (req, res) => {
  try {
    const { displayName, description, permissionIds } = req.body;

    const roleRes = await db.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
    if (roleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    const role = roleRes.rows[0];

    await db.query(
      'UPDATE roles SET display_name = COALESCE($1, display_name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3',
      [displayName, description, role.id]
    );

    if (Array.isArray(permissionIds)) {
      await db.query('DELETE FROM role_permissions WHERE role_id = $1', [role.id]);
      for (const pId of permissionIds) {
        await db.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [role.id, pId]
        );
      }
    }

    await logAudit(req.admin.id, req.admin.email, 'role.update', 'role', role.id, req, {
      roleName: role.name
    }, 'success');

    res.json({ message: 'Role updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/roles/:id
 * Delete non-system role
 */
router.delete('/:id', async (req, res) => {
  try {
    const roleRes = await db.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
    if (roleRes.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    const role = roleRes.rows[0];

    if (role.is_system) {
      return res.status(400).json({ error: 'Safety protection: System roles cannot be deleted.' });
    }

    // Check if any user has this role
    const countRes = await db.query('SELECT COUNT(*) FROM users WHERE role = $1', [role.name]);
    if (parseInt(countRes.rows[0].count, 10) > 0) {
      return res.status(400).json({ error: `Cannot delete role '${role.display_name}' because it is assigned to ${countRes.rows[0].count} user(s). Reassign them first.` });
    }

    await db.query('DELETE FROM roles WHERE id = $1', [role.id]);

    await logAudit(req.admin.id, req.admin.email, 'role.delete', 'role', role.id, req, {
      roleName: role.name
    }, 'warning');

    res.json({ message: `Role '${role.display_name}' deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
