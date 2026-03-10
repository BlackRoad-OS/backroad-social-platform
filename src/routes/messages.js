'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /messages - list conversations (latest message per user pair)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const messages = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           sender.username AS sender,
           recipient.username AS recipient
    FROM messages m
    JOIN users sender ON m.sender_id = sender.id
    JOIN users recipient ON m.recipient_id = recipient.id
    WHERE m.sender_id = ? OR m.recipient_id = ?
    ORDER BY m.created_at DESC
  `).all(req.session.userId, req.session.userId);
  return res.json(messages);
});

// GET /messages/:username - get conversation with a user
router.get('/:username', requireAuth, (req, res) => {
  const db = getDb();
  const other = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!other) return res.status(404).json({ error: 'User not found' });

  const messages = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           sender.username AS sender,
           recipient.username AS recipient
    FROM messages m
    JOIN users sender ON m.sender_id = sender.id
    JOIN users recipient ON m.recipient_id = recipient.id
    WHERE (m.sender_id = ? AND m.recipient_id = ?)
       OR (m.sender_id = ? AND m.recipient_id = ?)
    ORDER BY m.created_at ASC
  `).all(req.session.userId, other.id, other.id, req.session.userId);

  return res.json(messages);
});

// POST /messages/:username - send a message
router.post('/:username', requireAuth, (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const db = getDb();
  const recipient = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!recipient) return res.status(404).json({ error: 'User not found' });

  if (recipient.id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  const result = db.prepare(
    'INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)'
  ).run(req.session.userId, recipient.id, content);

  return res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
