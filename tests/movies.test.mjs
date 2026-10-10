import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, movieRow, reviewRow } from './helpers.mjs';

describe('GET /movies', () => {
  it('returns one page with pagination and resized poster URLs', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({ data: [movieRow()], error: null, count: 1000 }));

    const res = await request(app).get('/movies?page=3&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 3, limit: 10, total: 1000, total_pages: 100 });
    expect(res.body.data[0]).toMatchObject({
      id: 1,
      year: 1994,
      poster_thumb_url: 'https://m.media-amazon.com/images/M/abc@._V1_QL75_UX300_.jpg',
      poster_large_url: 'https://m.media-amazon.com/images/M/abc@._V1_QL75_UX600_.jpg',
    });
    expect(res.body.data[0]).not.toHaveProperty('poster_url');
    expect(res.body.data[0]).not.toHaveProperty('release_date');

    // rows 20-29 are page 3 at 10 per page
    expect(supabase.last('movies').args('range')).toEqual([20, 29]);
  });

  it('reads the catalog with the anonymous client', async () => {
    const { app, supabase } = createTestApp();
    await request(app).get('/movies');
    expect(supabase.last('movies').client).toBe('anon');
    expect(supabase.forToken).not.toHaveBeenCalled();
  });

  it('defaults to 20 per page sorted by title A-Z', async () => {
    const { app, supabase } = createTestApp();
    const res = await request(app).get('/movies');

    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(supabase.last('movies').args('order')).toEqual([
      'title',
      { ascending: true, nullsFirst: false },
    ]);
  });

  it('sorts by rating highest first unless told otherwise', async () => {
    const { app, supabase } = createTestApp();
    await request(app).get('/movies?sortBy=rating');
    expect(supabase.last('movies').args('order')).toEqual([
      'imdb_rating',
      { ascending: false, nullsFirst: false },
    ]);
  });

  it.each([
    ['limit above the cap', '/movies?limit=5000'],
    ['limit of zero', '/movies?limit=0'],
    ['non-numeric page', '/movies?page=abc'],
    ['unknown sort column', '/movies?sortBy=password'],
    ['malformed genre list', '/movies?genres=1;drop'],
  ])('rejects %s with 400 and does not query', async (_name, url) => {
    const { app, supabase } = createTestApp();
    const res = await request(app).get(url);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(supabase.queries).toHaveLength(0);
  });

  it('treats a page past the end as an empty page', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({ data: null, error: { code: 'PGRST103' }, count: null }));

    const res = await request(app).get('/movies?page=999');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /movies/:id', () => {
  it('returns the movie with genres and reviews, usernames included', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({
      data: {
        ...movieRow(),
        movie_genres: [{ genres: { id: 7, name: 'Drama' } }],
        reviews: [
          reviewRow(),
          reviewRow({ id: 11, user_profiles: null, username: 'stale-denormalised-name' }),
        ],
      },
      error: null,
    }));

    const res = await request(app).get('/movies/1');

    expect(res.status).toBe(200);
    expect(res.body.genres).toEqual([{ id: 7, name: 'Drama' }]);
    expect(res.body.reviews.map((review) => review.username)).toEqual(['alice', 'Anonymous']);
    expect(res.body.reviews[0]).not.toHaveProperty('user_profiles');
    expect(res.body).not.toHaveProperty('movie_genres');
    // one round trip for the whole page
    expect(supabase.queries).toHaveLength(1);
  });

  it('returns 404 for a movie that does not exist', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({ data: null, error: null }));

    const res = await request(app).get('/movies/999999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Movie not found' });
  });

  it.each(['abc', '0', '-4', '1.5'])('returns 400 for the id "%s"', async (id) => {
    const { app, supabase } = createTestApp();
    const res = await request(app).get(`/movies/${id}`);

    expect(res.status).toBe(400);
    expect(supabase.queries).toHaveLength(0);
  });
});

describe('GET /movies/:id/reviews', () => {
  it('lists reviews newest first with usernames from profiles', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('reviews', () => ({ data: [reviewRow()], error: null }));

    const res = await request(app).get('/movies/1/reviews');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 10, username: 'alice', rating: 5 });
    expect(supabase.last('reviews').eq('movie_id')).toBe(1);
    expect(supabase.last('reviews').args('order')).toEqual(['created_at', { ascending: false }]);
  });
});

describe('GET /genres', () => {
  it('lists genres', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('genres', () => ({ data: [{ id: 1, name: 'Action' }], error: null }));

    const res = await request(app).get('/genres');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'Action' }]);
  });
});

describe('database failures', () => {
  let consoleError;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('answers 500 without leaking the database message', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({
      data: null,
      error: { code: '42P01', message: 'relation "public.movies" does not exist' },
    }));

    const res = await request(app).get('/movies');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('relation');
    expect(consoleError).toHaveBeenCalled();
  });
});
