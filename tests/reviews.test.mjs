import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, asAlice, asBob, ALICE, BOB, reviewRow } from './helpers.mjs';

describe('POST /reviews/:movieId', () => {
  it('creates the review as the authenticated user', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', () => ({ data: reviewRow(), error: null }));

    const res = await request(app)
      .post('/reviews/1')
      .set(asAlice)
      .send({ rating: 5, comment: '  Great  ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 10, username: 'alice', rating: 5 });

    const query = supabase.last('reviews');
    expect(query.client).toBe('user:token-alice');
    expect(query.args('insert')[0]).toEqual({
      user_id: ALICE.id,
      movie_id: 1,
      rating: 5,
      comment: 'Great',
    });
  });

  it('ignores a user_id supplied in the body', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', () => ({ data: reviewRow(), error: null }));

    await request(app)
      .post('/reviews/1')
      .set(asAlice)
      .send({ rating: 4, comment: 'ok', user_id: BOB.id, username: 'admin' });

    const inserted = supabase.last('reviews').args('insert')[0];
    expect(inserted.user_id).toBe(ALICE.id);
    expect(inserted).not.toHaveProperty('username');
  });

  it('answers 409 when the user already reviewed the movie', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', () => ({ data: null, error: { code: '23505', message: 'duplicate' } }));

    const res = await request(app).post('/reviews/1').set(asAlice).send({ rating: 5 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'You have already reviewed this movie' });
  });

  it('answers 404 when the movie does not exist', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', () => ({
      data: null,
      error: {
        code: '23503',
        message: 'violates foreign key constraint "reviews_movie_id_fkey"',
      },
    }));

    const res = await request(app).post('/reviews/424242').set(asAlice).send({ rating: 5 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Movie not found' });
  });

  it.each([
    ['a missing rating', { comment: 'no rating' }],
    ['a rating of 0', { rating: 0 }],
    ['a rating of 6', { rating: 6 }],
    ['a fractional rating', { rating: 4.5 }],
    ['a comment over 500 characters', { rating: 5, comment: 'x'.repeat(501) }],
  ])('rejects %s', async (_name, body) => {
    const { app, supabase } = createTestApp();

    const res = await request(app).post('/reviews/1').set(asAlice).send(body);

    expect(res.status).toBe(400);
    expect(supabase.queries).toHaveLength(0);
  });

  it('rejects a non-numeric movie id', async () => {
    const { app } = createTestApp();
    const res = await request(app).post('/reviews/abc').set(asAlice).send({ rating: 5 });
    expect(res.status).toBe(400);
  });
});

// The first query each handler receives is the ownership lookup; the second
// is the write itself.
const ownedBy = (user) => (query) =>
  query.action === 'select'
    ? { data: { id: 10, user_id: user.id, movie_id: 1 }, error: null }
    : { data: reviewRow({ rating: 3, comment: 'Changed my mind' }), error: null };

describe('PUT /reviews/:id', () => {
  it('updates only rating and comment', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', ownedBy(ALICE));

    const res = await request(app)
      .put('/reviews/10')
      .set(asAlice)
      .send({ rating: 3, comment: 'Changed my mind', movie_id: 99 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rating: 3, comment: 'Changed my mind' });

    const update = supabase.last('reviews');
    expect(update.args('update')[0]).toEqual({ rating: 3, comment: 'Changed my mind' });
    expect(update.eq('id')).toBe(10);
  });

  it("answers 403 for someone else's review and does not write", async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', ownedBy(ALICE));

    const res = await request(app).put('/reviews/10').set(asBob).send({ rating: 1 });

    expect(res.status).toBe(403);
    expect(supabase.queries.map((query) => query.action)).toEqual(['select']);
  });

  it('answers 404 for a review that does not exist', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', () => ({ data: null, error: null }));

    const res = await request(app).put('/reviews/10').set(asAlice).send({ rating: 1 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /reviews/:id', () => {
  it('deletes the caller’s own review', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', (query) =>
      query.action === 'select'
        ? { data: { id: 10, user_id: ALICE.id, movie_id: 1 }, error: null }
        : { data: null, error: null },
    );

    const res = await request(app).delete('/reviews/10').set(asAlice);

    expect(res.status).toBe(204);
    expect(supabase.last('reviews').action).toBe('delete');
    expect(supabase.last('reviews').eq('id')).toBe(10);
  });

  it("answers 403 for someone else's review and does not delete", async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', ownedBy(ALICE));

    const res = await request(app).delete('/reviews/10').set(asBob);

    expect(res.status).toBe(403);
    expect(supabase.queries.some((query) => query.action === 'delete')).toBe(false);
  });
});
