import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, asAlice, ALICE, movieRow } from './helpers.mjs';

describe('watchlist', () => {
  it('lists the caller’s movies with poster sizes and the date added', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_watchlist', () => ({
      data: [{ added_at: '2026-02-02T00:00:00+00:00', movies: movieRow() }],
      error: null,
    }));

    const res = await request(app).get('/watchlist').set(asAlice);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: 1,
      added_at: '2026-02-02T00:00:00+00:00',
      poster_thumb_url: expect.stringContaining('UX300'),
    });
    expect(supabase.last('user_watchlist').eq('user_id')).toBe(ALICE.id);
  });

  it('adds a movie idempotently', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_watchlist', () => ({ data: null, error: null }));

    const res = await request(app).put('/watchlist/5').set(asAlice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ movie_id: 5, in_watchlist: true });
    expect(supabase.last('user_watchlist').args('upsert')).toEqual([
      { user_id: ALICE.id, movie_id: 5 },
      { onConflict: 'user_id,movie_id', ignoreDuplicates: true },
    ]);
  });

  it('answers 404 when adding a movie that does not exist', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_watchlist', () => ({ data: null, error: { code: '23503', message: 'fk' } }));

    const res = await request(app).put('/watchlist/424242').set(asAlice);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Movie not found' });
  });

  it('removes only the caller’s own entry', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_watchlist', () => ({ data: null, error: null }));

    const res = await request(app).delete('/watchlist/5').set(asAlice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ movie_id: 5, in_watchlist: false });
    const query = supabase.last('user_watchlist');
    expect(query.action).toBe('delete');
    expect(query.eq('user_id')).toBe(ALICE.id);
    expect(query.eq('movie_id')).toBe(5);
  });

  it('rejects a non-numeric movie id', async () => {
    const { app, supabase } = createTestApp();
    const res = await request(app).put('/watchlist/abc').set(asAlice);

    expect(res.status).toBe(400);
    expect(supabase.queries).toHaveLength(0);
  });
});

describe('profile', () => {
  const profile = { user_id: ALICE.id, username: 'alice', created_at: '2026-01-01T00:00:00+00:00' };

  it('returns the caller’s profile with their email', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_profiles', () => ({ data: profile, error: null }));

    const res = await request(app).get('/users/profile').set(asAlice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...profile, email: ALICE.email });
  });

  it('updates the username', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_profiles', () => ({
      data: { ...profile, username: 'alice_2' },
      error: null,
    }));

    const res = await request(app)
      .put('/users/profile')
      .set(asAlice)
      .send({ username: ' alice_2 ' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice_2');
    const query = supabase.last('user_profiles');
    expect(query.args('update')[0]).toEqual({ username: 'alice_2' });
    expect(query.eq('user_id')).toBe(ALICE.id);
  });

  it('answers 409 when the username is taken', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_profiles', () => ({ data: null, error: { code: '23505', message: 'dup' } }));

    const res = await request(app).put('/users/profile').set(asAlice).send({ username: 'bob' });

    expect(res.status).toBe(409);
  });

  it.each([
    ['empty', ''],
    ['too short', 'ab'],
    ['too long', 'a'.repeat(31)],
    ['containing spaces', 'alice smith'],
    ['an email address', 'alice@example.com'],
    ['containing markup', '<script>'],
  ])('rejects a username that is %s', async (_name, username) => {
    const { app, supabase } = createTestApp();

    const res = await request(app).put('/users/profile').set(asAlice).send({ username });

    expect(res.status).toBe(400);
    expect(supabase.queries).toHaveLength(0);
  });
});
