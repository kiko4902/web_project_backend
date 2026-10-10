import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, asAlice, asBob, ALICE } from './helpers.mjs';

describe('requireAuth', () => {
  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { Authorization: 'Basic abc' }],
    ['a Bearer header with no token', { Authorization: 'Bearer' }],
  ])('rejects %s with 401 before any query', async (_name, headers) => {
    const { app, supabase } = createTestApp();

    const res = await request(app).get('/watchlist').set(headers);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authorization token required' });
    expect(supabase.queries).toHaveLength(0);
    expect(supabase.forToken).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase does not recognise', async () => {
    const { app, supabase } = createTestApp();

    const res = await request(app).get('/watchlist').set({ Authorization: 'Bearer forged' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(supabase.anon.auth.getUser).toHaveBeenCalledWith('forged');
    expect(supabase.forToken).not.toHaveBeenCalled();
  });

  it("runs the request's queries on a client bound to the caller's token", async () => {
    const { app, supabase } = createTestApp();

    const res = await request(app).get('/watchlist').set(asAlice);

    expect(res.status).toBe(200);
    expect(supabase.forToken).toHaveBeenCalledWith('token-alice');
    expect(supabase.last('user_watchlist').client).toBe('user:token-alice');
    expect(supabase.last('user_watchlist').eq('user_id')).toBe(ALICE.id);
  });

  it('gives each request its own client, so callers never share identity', async () => {
    const { app, supabase } = createTestApp();

    await Promise.all([
      request(app).get('/watchlist').set(asAlice),
      request(app).get('/watchlist').set(asBob),
    ]);

    const clients = supabase.queries.map((query) => query.client).sort();
    expect(clients).toEqual(['user:token-alice', 'user:token-bob']);
    expect(supabase.forToken).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['GET', '/watchlist'],
    ['PUT', '/watchlist/1'],
    ['DELETE', '/watchlist/1'],
    ['POST', '/reviews/1'],
    ['PUT', '/reviews/1'],
    ['DELETE', '/reviews/1'],
    ['GET', '/users/profile'],
    ['PUT', '/users/profile'],
  ])('%s %s requires authentication', async (method, url) => {
    const { app } = createTestApp();
    const res = await request(app)[method.toLowerCase()](url);
    expect(res.status).toBe(401);
  });
});
