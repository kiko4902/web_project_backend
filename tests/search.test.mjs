import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, movieRow } from './helpers.mjs';

describe('GET /search', () => {
  it('matches part of a title, case-insensitively', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({ data: [movieRow()], error: null, count: 1 }));

    const res = await request(app).get('/search?q=shaw');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(supabase.last('movies').args('ilike')).toEqual(['title', '%shaw%']);
  });

  it('escapes LIKE wildcards typed by the user', async () => {
    const { app, supabase } = createTestApp();

    await request(app).get(`/search?q=${encodeURIComponent('100%_*')}`);

    expect(supabase.last('movies').args('ilike')).toEqual(['title', '%100\\%\\_%']);
  });

  it('is paginated and never returns the whole table', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({ data: [], error: null, count: 1000 }));

    const res = await request(app).get('/search');

    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1000, total_pages: 50 });
    expect(supabase.last('movies').args('range')).toEqual([0, 19]);
    expect(supabase.last('movies').has('ilike')).toBe(false);
  });

  it('filters by genre with an inner join and hides the join from the result', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('movies', () => ({
      data: [{ ...movieRow(), movie_genres: [{ genre_id: 7 }] }],
      error: null,
      count: 1,
    }));

    const res = await request(app).get('/search?genres=7,3,7');

    const query = supabase.last('movies');
    expect(query.args('select')[0]).toContain('movie_genres!inner(genre_id)');
    expect(query.args('in')).toEqual(['movie_genres.genre_id', [7, 3]]);
    expect(res.body.data[0]).not.toHaveProperty('movie_genres');
  });

  it('applies year and rating bounds', async () => {
    const { app, supabase } = createTestApp();

    await request(app).get('/search?minYear=1990&maxYear=1999&minRating=8.5');

    const query = supabase.last('movies');
    expect(query.ops).toContainEqual(['gte', 'release_date', 1990]);
    expect(query.ops).toContainEqual(['lte', 'release_date', 1999]);
    expect(query.ops).toContainEqual(['gte', 'imdb_rating', 8.5]);
  });

  it('adds no filters that were not asked for', async () => {
    const { app, supabase } = createTestApp();

    await request(app).get('/search?q=god');

    const query = supabase.last('movies');
    expect(query.has('gte')).toBe(false);
    expect(query.has('lte')).toBe(false);
    expect(query.has('in')).toBe(false);
  });

  it.each([
    ['a query longer than 100 characters', `/search?q=${'a'.repeat(101)}`],
    ['a year before 1900', '/search?minYear=1200'],
    ['a rating above 10', '/search?minRating=11'],
    ['a limit above the cap', '/search?limit=51'],
  ])('rejects %s', async (_name, url) => {
    const { app, supabase } = createTestApp();
    const res = await request(app).get(url);

    expect(res.status).toBe(400);
    expect(supabase.queries).toHaveLength(0);
  });
});
