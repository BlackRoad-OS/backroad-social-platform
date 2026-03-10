'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /knowledge - list the current user's knowledge entries
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const entries = db.prepare(`
    SELECT id, title, tags, created_at, updated_at
    FROM knowledge_entries
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(req.session.userId);
  return res.json(entries);
});

// GET /knowledge/:id - get a single entry
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare(`
    SELECT id, title, content, tags, created_at, updated_at
    FROM knowledge_entries
    WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  return res.json(entry);
});

// POST /knowledge - create an entry
router.post('/', requireAuth, (req, res) => {
  const { title, content, tags } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO knowledge_entries (user_id, title, content, tags) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, title, content, tags || '');

  return res.status(201).json({ id: result.lastInsertRowid, title });
});

// PATCH /knowledge/:id - update an entry
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM knowledge_entries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  const title = req.body.title !== undefined ? req.body.title : entry.title;
  const content = req.body.content !== undefined ? req.body.content : entry.content;
  const tags = req.body.tags !== undefined ? req.body.tags : entry.tags;

  db.prepare(`
    UPDATE knowledge_entries
    SET title = ?, content = ?, tags = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title, content, tags, req.params.id);

  return res.json({ message: 'Entry updated' });
});

// DELETE /knowledge/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT id FROM knowledge_entries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(req.params.id);
  return res.json({ message: 'Entry deleted' });
});

module.exports = router;
