'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const communitiesRoutes = require('./routes/communities');
const knowledgeRoutes = require('./routes/knowledge');
const readingRoutes = require('./routes/reading');
const messagesRoutes = require('./routes/messages');

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
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }));

  // Serve the landing page and static assets
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // API routes
  app.use('/auth', authRoutes);
  app.use('/posts', postsRoutes);
  app.use('/communities', communitiesRoutes);
  app.use('/knowledge', knowledgeRoutes);
  app.use('/reading', readingRoutes);
  app.use('/messages', messagesRoutes);

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
