const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../../config/database');
const { superAdminMiddleware, logAudit } = require('../../middleware/adminAuth');

router.use(superAdminMiddleware);

const uploadsDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * GET /api/admin/media
 * List uploaded media files
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.*, u.email as uploaded_by_email
      FROM media_files m
      LEFT JOIN users u ON m.uploaded_by = u.id
      ORDER BY m.created_at DESC
    `);
    res.json({ files: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/media/:id
 * Delete media file
 */
router.delete('/:id', async (req, res) => {
  try {
    const fileRes = await db.query('SELECT * FROM media_files WHERE id = $1', [req.params.id]);
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    const file = fileRes.rows[0];

    if (fs.existsSync(file.file_path)) {
      try { fs.unlinkSync(file.file_path); } catch {}
    }

    await db.query('DELETE FROM media_files WHERE id = $1', [file.id]);

    await logAudit(req.admin.id, req.admin.email, 'media.delete', 'media', file.id, req, {
      filename: file.filename
    }, 'warning');

    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
