'use strict';

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const communitiesRoutes = require('./routes/communities');
const knowledgeRoutes = require('./routes/knowledge');
const readingRoutes = require('./routes/reading');
const messagesRoutes = require('./routes/messages');

// Stricter limiter for auth endpoints to slow brute-force attempts
const authLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20,
      standardHeaders: true,
      legacyHeaders: false
    });

// General API limiter
const apiLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 120,
      standardHeaders: true,
      legacyHeaders: false
    });

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'backroad-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // sameSite 'strict' prevents the cookie from being sent on cross-site
      // requests, which is the primary CSRF mitigation for session cookies.
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }));

  // Serve the landing page and static assets
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // API routes — auth endpoints get a stricter rate limiter
  app.use('/auth', authLimiter, authRoutes);
  app.use('/posts', apiLimiter, postsRoutes);
  app.use('/communities', apiLimiter, communitiesRoutes);
  app.use('/knowledge', apiLimiter, knowledgeRoutes);
  app.use('/reading', apiLimiter, readingRoutes);
  app.use('/messages', apiLimiter, messagesRoutes);

  // Serve index.html for the root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'backroad-social-platform' });
  });

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`BackRoad running on http://localhost:${PORT}`);
  });
}
