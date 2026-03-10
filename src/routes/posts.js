'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /posts - list all posts (chronological, no likes, no algorithmic sorting)
router.get('/', (req, res) => {
  const db = getDb();
  const { community } = req.query;

  let query = `
    SELECT p.id, p.title, p.content, p.created_at,
           u.username AS author,
           c.name AS community_name, c.slug AS community_slug,
           (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN communities c ON p.community_id = c.id
  `;
  const params = [];

  if (community) {
    query += ' WHERE c.slug = ?';
    params.push(community);
  }

  query += ' ORDER BY p.created_at DESC';

  const posts = db.prepare(query).all(...params);
  return res.json(posts);
});

// GET /posts/:id - get a single post with its replies (chronological)
router.get('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare(`
    SELECT p.id, p.title, p.content, p.created_at,
           u.username AS author,
           c.name AS community_name, c.slug AS community_slug
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN communities c ON p.community_id = c.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!post) return res.status(404).json({ error: 'Post not found' });

  const replies = db.prepare(`
    SELECT r.id, r.content, r.created_at, u.username AS author
    FROM replies r
    JOIN users u ON r.user_id = u.id
    WHERE r.post_id = ?
    ORDER BY r.created_at ASC
  `).all(req.params.id);

  return res.json({ ...post, replies });
});

// POST /posts - create a new post
router.post('/', requireAuth, (req, res) => {
  const { title, content, community_slug } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const db = getDb();
  let communityId = null;

  if (community_slug) {
    const community = db.prepare('SELECT id FROM communities WHERE slug = ?').get(community_slug);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    communityId = community.id;
  }

  const result = db.prepare(
    'INSERT INTO posts (user_id, community_id, title, content) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, communityId, title, content);

  return res.status(201).json({ id: result.lastInsertRowid, title });
});

// DELETE /posts/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.prepare('DELETE FROM replies WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  return res.json({ message: 'Post deleted' });
});

// POST /posts/:id/replies - reply to a post
router.post('/:id/replies', requireAuth, (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const db = getDb();
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const result = db.prepare(
    'INSERT INTO replies (post_id, user_id, content) VALUES (?, ?, ?)'
  ).run(req.params.id, req.session.userId, content);

  return res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
