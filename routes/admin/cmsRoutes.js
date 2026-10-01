const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

/**
 * GET /api/admin/cms
 * List all CMS content items
 */
router.get('/', async (req, res) => {
  try {
    const { type = '' } = req.query;
    let query = 'SELECT * FROM cms_content';
    let params = [];

    if (type) {
      params.push(type);
      query += ' WHERE type = $1';
    }

    query += ' ORDER BY type ASC, sort_order ASC, created_at DESC';
    const result = await db.query(query, params);

    res.json({ content: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/cms
 * Create new CMS item
 */
router.post('/', async (req, res) => {
  try {
    const { type = 'announcement', title, slug, content, category, isPublished = true, sortOrder = 0 } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const cleanSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) + '-' + Date.now().toString().slice(-4);

    const insertRes = await db.query(
      `INSERT INTO cms_content (type, title, slug, content, category, is_published, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [type, title, cleanSlug, content, category || null, isPublished, parseInt(sortOrder, 10) || 0, req.admin.id]
    );

    const item = insertRes.rows[0];

    await logAudit(req.admin.id, req.admin.email, 'cms.create', 'cms', item.id, req, {
      type: item.type,
      title: item.title
    }, 'success');

    res.status(201).json({ message: 'Content created', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/cms/:id
 * Update CMS item
 */
router.put('/:id', async (req, res) => {
  try {
    const { title, content, category, isPublished, sortOrder } = req.body;

    const updateRes = await db.query(
      `UPDATE cms_content
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           category = COALESCE($3, category),
           is_published = COALESCE($4, is_published),
           sort_order = COALESCE($5, sort_order),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title, content, category, isPublished !== undefined ? Boolean(isPublished) : null, sortOrder !== undefined ? parseInt(sortOrder, 10) : null, req.params.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Content item not found' });
    }

    await logAudit(req.admin.id, req.admin.email, 'cms.update', 'cms', req.params.id, req, {
      title
    }, 'success');

    res.json({ message: 'Content updated', item: updateRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/cms/:id
 * Delete CMS item
 */
router.delete('/:id', async (req, res) => {
  try {
    const delRes = await db.query('DELETE FROM cms_content WHERE id = $1 RETURNING title, type', [req.params.id]);
    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    await logAudit(req.admin.id, req.admin.email, 'cms.delete', 'cms', req.params.id, req, {
      title: delRes.rows[0].title
    }, 'warning');

    res.json({ message: 'Content deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
