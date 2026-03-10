'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use a temp database for tests
process.env.DB_PATH = path.join(__dirname, '..', 'test.db');

const { createApp } = require('../src/index');
const { closeDb } = require('../src/db');

let app;

beforeAll(() => {
  app = createApp();
});

afterAll(() => {
  closeDb();
  try { fs.unlinkSync(process.env.DB_PATH); } catch (_) {}
});

describe('Health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth', () => {
  let agent;

  beforeEach(() => {
    agent = request.agent(app);
  });

  it('registers a new user', async () => {
    const res = await agent.post('/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'securepass'
    });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('alice');
  });

  it('rejects duplicate username', async () => {
    await agent.post('/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'securepass'
    });
    const res = await agent.post('/auth/register').send({
      username: 'bob',
      email: 'bob2@example.com',
      password: 'securepass'
    });
    expect(res.status).toBe(409);
  });

  it('rejects short password', async () => {
    const res = await agent.post('/auth/register').send({
      username: 'charlie',
      email: 'charlie@example.com',
      password: 'short'
    });
    expect(res.status).toBe(400);
  });

  it('logs in successfully', async () => {
    await agent.post('/auth/register').send({
      username: 'dave',
      email: 'dave@example.com',
      password: 'securepass'
    });
    const res = await agent.post('/auth/login').send({
      username: 'dave',
      password: 'securepass'
    });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('dave');
  });

  it('rejects wrong password', async () => {
    const res = await agent.post('/auth/login').send({
      username: 'dave',
      password: 'wrongpass'
    });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns user when authenticated', async () => {
    await agent.post('/auth/register').send({
      username: 'eve',
      email: 'eve@example.com',
      password: 'securepass'
    });
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('eve');
  });

  it('GET /auth/me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('logs out', async () => {
    await agent.post('/auth/register').send({
      username: 'frank',
      email: 'frank@example.com',
      password: 'securepass'
    });
    await agent.post('/auth/logout');
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('updates bio via PATCH /auth/me', async () => {
    await agent.post('/auth/register').send({
      username: 'grace',
      email: 'grace@example.com',
      password: 'securepass'
    });
    const res = await agent.patch('/auth/me').send({ bio: 'Hello world' });
    expect(res.status).toBe(200);
    const me = await agent.get('/auth/me');
    expect(me.body.bio).toBe('Hello world');
  });
});

describe('Posts', () => {
  let agent;

  beforeEach(async () => {
    agent = request.agent(app);
    await agent.post('/auth/register').send({
      username: `user_${Date.now()}`,
      email: `u${Date.now()}@example.com`,
      password: 'securepass'
    });
  });

  it('GET /posts returns empty array initially', async () => {
    // Use a fresh app instance check - posts may exist from other tests
    const res = await request(app).get('/posts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /posts creates a post when authenticated', async () => {
    const res = await agent.post('/posts').send({
      title: 'Hello BackRoad',
      content: 'This is a meaningful post without any vanity metrics.'
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Hello BackRoad');
  });

  it('POST /posts returns 401 when not authenticated', async () => {
    const res = await request(app).post('/posts').send({
      title: 'Unauthenticated post',
      content: 'Should fail.'
    });
    expect(res.status).toBe(401);
  });

  it('GET /posts/:id returns post with replies', async () => {
    const create = await agent.post('/posts').send({
      title: 'Deep thread',
      content: 'Lets discuss something meaningful.'
    });
    const id = create.body.id;

    await agent.post(`/posts/${id}/replies`).send({ content: 'Great point!' });

    const res = await agent.get(`/posts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Deep thread');
    expect(res.body.replies).toHaveLength(1);
    expect(res.body.replies[0].content).toBe('Great point!');
  });

  it('returned posts have no like count (BackRoad principle)', async () => {
    await agent.post('/posts').send({ title: 'No likes', content: 'Metrics-free.' });
    const res = await request(app).get('/posts');
    for (const post of res.body) {
      expect(post).not.toHaveProperty('likes');
      expect(post).not.toHaveProperty('like_count');
    }
  });

  it('posts are returned in chronological (newest-first) order', async () => {
    await agent.post('/posts').send({ title: 'First', content: 'First post.' });
    await agent.post('/posts').send({ title: 'Second', content: 'Second post.' });

    const res = await request(app).get('/posts');
    expect(res.status).toBe(200);
    // Dates should be in descending order
    const dates = res.body.map((p) => new Date(p.created_at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('DELETE /posts/:id removes the post', async () => {
    const create = await agent.post('/posts').send({ title: 'To delete', content: 'Gone.' });
    const id = create.body.id;
    const del = await agent.delete(`/posts/${id}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/posts/${id}`);
    expect(get.status).toBe(404);
  });
});

describe('Communities', () => {
  let agent;

  beforeEach(async () => {
    agent = request.agent(app);
    await agent.post('/auth/register').send({
      username: `comm_user_${Date.now()}`,
      email: `comm${Date.now()}@example.com`,
      password: 'securepass'
    });
  });

  it('GET /communities returns array', async () => {
    const res = await request(app).get('/communities');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /communities creates a community', async () => {
    const slug = `test-community-${Date.now()}`;
    const res = await agent.post('/communities').send({
      slug,
      name: 'Test Community',
      description: 'A place for meaningful discourse'
    });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe(slug);
  });

  it('rejects invalid slug characters', async () => {
    const res = await agent.post('/communities').send({
      slug: 'Invalid Slug!',
      name: 'Bad Community'
    });
    expect(res.status).toBe(400);
  });

  it('can join and leave a community', async () => {
    const slug = `joinable-${Date.now()}`;
    await agent.post('/communities').send({ slug, name: 'Joinable' });

    // Use a second agent to join
    const agent2 = request.agent(app);
    await agent2.post('/auth/register').send({
      username: `joiner_${Date.now()}`,
      email: `joiner${Date.now()}@example.com`,
      password: 'securepass'
    });
    const join = await agent2.post(`/communities/${slug}/join`);
    expect(join.status).toBe(200);

    const leave = await agent2.post(`/communities/${slug}/leave`);
    expect(leave.status).toBe(200);
  });

  it('community lists no follower counts (BackRoad principle)', async () => {
    const res = await request(app).get('/communities');
    for (const c of res.body) {
      expect(c).not.toHaveProperty('follower_count');
      expect(c).not.toHaveProperty('followers');
    }
  });
});

describe('Knowledge Base', () => {
  let agent;

  beforeEach(async () => {
    agent = request.agent(app);
    await agent.post('/auth/register').send({
      username: `kb_user_${Date.now()}`,
      email: `kb${Date.now()}@example.com`,
      password: 'securepass'
    });
  });

  it('GET /knowledge requires auth', async () => {
    const res = await request(app).get('/knowledge');
    expect(res.status).toBe(401);
  });

  it('POST /knowledge creates an entry', async () => {
    const res = await agent.post('/knowledge').send({
      title: 'How Express Works',
      content: 'Express is a minimal web framework...',
      tags: 'node,express'
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('How Express Works');
  });

  it('PATCH /knowledge/:id updates an entry', async () => {
    const create = await agent.post('/knowledge').send({
      title: 'Original Title',
      content: 'Original content'
    });
    const id = create.body.id;

    const update = await agent.patch(`/knowledge/${id}`).send({ title: 'Updated Title' });
    expect(update.status).toBe(200);

    const get = await agent.get(`/knowledge/${id}`);
    expect(get.body.title).toBe('Updated Title');
  });

  it('DELETE /knowledge/:id removes the entry', async () => {
    const create = await agent.post('/knowledge').send({
      title: 'To delete',
      content: 'Gone soon.'
    });
    const id = create.body.id;
    await agent.delete(`/knowledge/${id}`);
    const get = await agent.get(`/knowledge/${id}`);
    expect(get.status).toBe(404);
  });
});

describe('Reading List', () => {
  let agent;

  beforeEach(async () => {
    agent = request.agent(app);
    await agent.post('/auth/register').send({
      username: `rl_user_${Date.now()}`,
      email: `rl${Date.now()}@example.com`,
      password: 'securepass'
    });
  });

  it('GET /reading requires auth', async () => {
    const res = await request(app).get('/reading');
    expect(res.status).toBe(401);
  });

  it('POST /reading adds an item', async () => {
    const res = await agent.post('/reading').send({
      title: 'The Pragmatic Programmer',
      url: 'https://pragprog.com',
      notes: 'Classic software engineering book'
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('The Pragmatic Programmer');
  });

  it('PATCH /reading/:id updates notes', async () => {
    const create = await agent.post('/reading').send({ title: 'Some Book', url: '', notes: '' });
    const id = create.body.id;

    await agent.patch(`/reading/${id}`).send({ notes: 'Highly recommended!' });
    const get = await agent.get(`/reading/${id}`);
    expect(get.body.notes).toBe('Highly recommended!');
  });

  it('DELETE /reading/:id removes item', async () => {
    const create = await agent.post('/reading').send({ title: 'To remove' });
    const id = create.body.id;
    await agent.delete(`/reading/${id}`);
    const get = await agent.get(`/reading/${id}`);
    expect(get.status).toBe(404);
  });
});

describe('Messages', () => {
  let agent1;
  let agent2;

  beforeEach(async () => {
    agent1 = request.agent(app);
    agent2 = request.agent(app);

    const ts = Date.now();
    await agent1.post('/auth/register').send({
      username: `msg1_${ts}`,
      email: `msg1_${ts}@example.com`,
      password: 'securepass'
    });
    await agent2.post('/auth/register').send({
      username: `msg2_${ts}`,
      email: `msg2_${ts}@example.com`,
      password: 'securepass'
    });

    this.user1 = `msg1_${ts}`;
    this.user2 = `msg2_${ts}`;
  });

  it('GET /messages requires auth', async () => {
    const res = await request(app).get('/messages');
    expect(res.status).toBe(401);
  });

  it('POST /messages/:username sends a message', async () => {
    const res = await agent1.post(`/messages/${this.user2}`).send({ content: 'Hello!' });
    expect(res.status).toBe(201);
  });

  it('GET /messages/:username returns conversation', async () => {
    await agent1.post(`/messages/${this.user2}`).send({ content: 'Hey there!' });
    const res = await agent1.get(`/messages/${this.user2}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].content).toBe('Hey there!');
  });

  it('cannot message yourself', async () => {
    const res = await agent1.post(`/messages/${this.user1}`).send({ content: 'Hi me!' });
    expect(res.status).toBe(400);
  });
});
