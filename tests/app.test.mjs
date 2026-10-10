import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, ALICE } from './helpers.mjs';
import postersModule from '../src/lib/posters.js';
import rateLimitModule from '../src/middleware/rateLimit.js';

const { posterUrl } = postersModule;
const { SupabaseStore } = rateLimitModule;

describe('health', () => {
  it('GET /health answers without touching the database', async () => {
    const { app, supabase } = createTestApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(supabase.queries).toHaveLength(0);
  });

  it('GET /health/db runs a real query', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('genres', () => ({ data: [{ id: 1 }], error: null }));

    const res = await request(app).get('/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
    expect(supabase.queries).toHaveLength(1);
  });

  it('GET /health/db answers 503 when the query fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, supabase } = createTestApp();
    supabase.on('genres', () => ({ data: null, error: { message: 'connection refused' } }));

    const res = await request(app).get('/health/db');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'down' });
    consoleError.mockRestore();
  });
});

describe('error handling', () => {
  it('answers unknown routes with a JSON 404', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });

  it('answers malformed JSON with 400', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Request body is not valid JSON' });
  });

  it('answers an oversized body with 413', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: ALICE.email, password: 'x'.repeat(20000) });

    expect(res.status).toBe(413);
  });

  it('does not advertise the framework', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/health');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});

describe('CORS', () => {
  it.each([
    ['a configured origin', 'https://app.example.com'],
    ['an origin matching a wildcard entry', 'https://app-git-feature-x.example.dev'],
  ])('allows %s', async (_name, origin) => {
    const { app } = createTestApp();

    const res = await request(app).get('/health').set('Origin', origin);

    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it.each([
    ['an unknown origin', 'https://evil.example'],
    ['a look-alike of a configured origin', 'https://app.example.com.evil.example'],
    ['a wildcard that would span a dot', 'https://app-x.evil.example.dev'],
  ])('sends no CORS headers to %s', async (_name, origin) => {
    const { app } = createTestApp();

    const res = await request(app).get('/health').set('Origin', origin);

    expect(res.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('answers preflight for an allowed origin', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .options('/reviews/1')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });
});

describe('rate limiting', () => {
  const badLogin = (app) =>
    request(app).post('/auth/login').send({ email: ALICE.email, password: 'wrong-password' });

  it('blocks sign-in after 10 failed attempts', async () => {
    const { app } = createTestApp({ rateLimit: { enabled: true } });

    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await badLogin(app)).status).toBe(401);
    }
    const blocked = await badLogin(app);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many requests/);
    expect(blocked.headers).toHaveProperty('retry-after');
  });

  it('does not count successful sign-ins', async () => {
    const { app, supabase } = createTestApp({ rateLimit: { enabled: true } });
    supabase.on('user_profiles', () => ({ data: { username: 'alice' }, error: null }));
    supabase.authApi.signInWithPassword.mockResolvedValue({
      data: { user: ALICE, session: { access_token: 'a', refresh_token: 'r', expires_at: 1 } },
      error: null,
    });

    for (let attempt = 1; attempt <= 15; attempt++) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: ALICE.email, password: 'secret1' });
      expect(res.status).toBe(200);
    }
  });
});

describe('SupabaseStore', () => {
  it('counts hits through the database under a hashed key', async () => {
    const resetAt = '2026-01-01T00:15:00+00:00';
    const admin = {
      rpc: vi.fn(async () => ({ data: [{ hits: 3, reset_at: resetAt }], error: null })),
    };
    const store = new SupabaseStore(admin, 'login');
    store.init({ windowMs: 900000 });

    const result = await store.increment('203.0.113.9');

    expect(result).toEqual({ totalHits: 3, resetTime: new Date(resetAt) });
    const [fn, params] = admin.rpc.mock.calls[0];
    expect(fn).toBe('rate_limit_hit');
    expect(params.p_window_ms).toBe(900000);
    expect(params.p_key).toMatch(/^login:[0-9a-f]{32}$/);
    expect(params.p_key).not.toContain('203.0.113.9');
  });

  it('surfaces a store failure so the limiter can fail open', async () => {
    const admin = { rpc: vi.fn(async () => ({ data: null, error: new Error('db down') })) };
    const store = new SupabaseStore(admin, 'login');
    store.init({ windowMs: 1000 });

    await expect(store.increment('203.0.113.9')).rejects.toThrow('db down');
  });
});

describe('posterUrl', () => {
  const base = 'https://m.media-amazon.com/images/M/abc@';

  it.each([
    ['width-cropped source', `${base}._V1_UX67_CR0,0,67,98_AL_.jpg`],
    ['height-cropped source', `${base}._V1_UY98_CR1,0,67,98_AL_.jpg`],
  ])('rewrites a %s to the requested width', (_name, url) => {
    expect(posterUrl(url, 'thumb')).toBe(`${base}._V1_QL75_UX300_.jpg`);
    expect(posterUrl(url, 'large')).toBe(`${base}._V1_QL75_UX600_.jpg`);
  });

  it('leaves other hosts and unrecognised shapes alone', () => {
    expect(posterUrl('https://example.com/p._V1_UX67_.jpg', 'thumb')).toBe(
      'https://example.com/p._V1_UX67_.jpg',
    );
    expect(posterUrl(`${base}.jpg`, 'thumb')).toBe(`${base}.jpg`);
  });

  it('returns null when there is no poster', () => {
    expect(posterUrl(null, 'thumb')).toBeNull();
    expect(posterUrl('', 'large')).toBeNull();
  });
});
