'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /communities - list all communities
router.get('/', (req, res) => {
  const db = getDb();
  const communities = db.prepare(`
    SELECT c.id, c.slug, c.name, c.description, c.created_at,
           u.username AS created_by,
           (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) AS member_count,
           (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id) AS post_count
    FROM communities c
    JOIN users u ON c.created_by = u.id
    ORDER BY c.created_at DESC
  `).all();
  return res.json(communities);
});

// GET /communities/:slug - get a community
router.get('/:slug', (req, res) => {
  const db = getDb();
  const community = db.prepare(`
    SELECT c.id, c.slug, c.name, c.description, c.created_at,
           u.username AS created_by
    FROM communities c
    JOIN users u ON c.created_by = u.id
    WHERE c.slug = ?
  `).get(req.params.slug);

  if (!community) return res.status(404).json({ error: 'Community not found' });

  const members = db.prepare(`
    SELECT u.username, cm.role, cm.joined_at
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = ?
    ORDER BY cm.joined_at ASC
  `).all(community.id);

  return res.json({ ...community, members });
});

// POST /communities - create a community
router.post('/', requireAuth, (req, res) => {
  const { slug, name, description } = req.body;

  if (!slug || !name) {
    return res.status(400).json({ error: 'slug and name are required' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug may only contain lowercase letters, digits, and hyphens' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM communities WHERE slug = ?').get(slug);
  if (existing) return res.status(409).json({ error: 'A community with that slug already exists' });

  const result = db.prepare(
    'INSERT INTO communities (slug, name, description, created_by) VALUES (?, ?, ?, ?)'
  ).run(slug, name, description || '', req.session.userId);

  // Creator automatically joins as moderator
  db.prepare(
    'INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)'
  ).run(result.lastInsertRowid, req.session.userId, 'moderator');

  return res.status(201).json({ id: result.lastInsertRowid, slug, name });
});

// POST /communities/:slug/join
router.post('/:slug/join', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT id FROM communities WHERE slug = ?').get(req.params.slug);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const existing = db.prepare(
    'SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?'
  ).get(community.id, req.session.userId);
  if (existing) return res.status(409).json({ error: 'Already a member' });

  db.prepare(
    'INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)'
  ).run(community.id, req.session.userId, 'member');

  return res.json({ message: 'Joined community' });
});

// POST /communities/:slug/leave
router.post('/:slug/leave', requireAuth, (req, res) => {
  const db = getDb();
  const community = db.prepare('SELECT id FROM communities WHERE slug = ?').get(req.params.slug);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  db.prepare(
    'DELETE FROM community_members WHERE community_id = ? AND user_id = ?'
  ).run(community.id, req.session.userId);

  return res.json({ message: 'Left community' });
});

module.exports = router;
