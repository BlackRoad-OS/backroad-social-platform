'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const router = express.Router();

// POST /auth/register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'username must be 3–30 characters' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(username, email, hash);

  req.session.userId = result.lastInsertRowid;
  req.session.username = username;

  return res.status(201).json({ id: result.lastInsertRowid, username });
});

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  return res.json({ id: user.id, username: user.username });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// GET /auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id, username, email, bio, created_at FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

// PATCH /auth/me - update bio
router.patch('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { bio } = req.body;
  if (typeof bio !== 'string') {
    return res.status(400).json({ error: 'bio must be a string' });
  }
  const db = getDb();
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.session.userId);
  return res.json({ message: 'Profile updated' });
});

module.exports = router;
