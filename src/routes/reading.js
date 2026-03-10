'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /reading - list the current user's reading list
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT id, title, url, notes, created_at
    FROM reading_list
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.session.userId);
  return res.json(items);
});

// GET /reading/:id - get a single reading list item
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT id, title, url, notes, created_at
    FROM reading_list
    WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  return res.json(item);
});

// POST /reading - add an item
router.post('/', requireAuth, (req, res) => {
  const { title, url, notes } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO reading_list (user_id, title, url, notes) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, title, url || '', notes || '');

  return res.status(201).json({ id: result.lastInsertRowid, title });
});

// PATCH /reading/:id - update notes on an item
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM reading_list WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const title = req.body.title !== undefined ? req.body.title : item.title;
  const url = req.body.url !== undefined ? req.body.url : item.url;
  const notes = req.body.notes !== undefined ? req.body.notes : item.notes;

  db.prepare('UPDATE reading_list SET title = ?, url = ?, notes = ? WHERE id = ?')
    .run(title, url, notes, req.params.id);

  return res.json({ message: 'Item updated' });
});

// DELETE /reading/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT id FROM reading_list WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  db.prepare('DELETE FROM reading_list WHERE id = ?').run(req.params.id);
  return res.json({ message: 'Item deleted' });
});

module.exports = router;
