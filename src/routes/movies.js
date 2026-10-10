const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { notFound } = require('../lib/httpError');
const { MOVIE_COLUMNS, REVIEW_COLUMNS, listMovies, toMovie, toReview } = require('../lib/movies');

function moviesRouter({ supabase }) {
  const router = Router();

  router.get('/', validate({ query: schemas.movieList }), async (req, res) => {
    res.json(await listMovies(supabase.anon, req.valid.query));
  });

  // Movie, its genres and its reviews (with usernames) in a single query.
  router.get('/:id', validate({ params: schemas.idParam }), async (req, res) => {
    const { data, error } = await supabase.anon
      .from('movies')
      .select(`${MOVIE_COLUMNS}, movie_genres(genres(id, name)), reviews(${REVIEW_COLUMNS})`)
      .eq('id', req.valid.params.id)
      .order('created_at', { referencedTable: 'reviews', ascending: false })
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('Movie not found');

    const { movie_genres: movieGenres, reviews, ...movie } = data;
    res.json({
      ...toMovie(movie),
      genres: (movieGenres || []).map((row) => row.genres).filter(Boolean),
      reviews: (reviews || []).map(toReview),
    });
  });

  router.get('/:id/reviews', validate({ params: schemas.idParam }), async (req, res) => {
    const { data, error } = await supabase.anon
      .from('reviews')
      .select(REVIEW_COLUMNS)
      .eq('movie_id', req.valid.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data.map(toReview));
  });

  return router;
}

function searchRouter({ supabase }) {
  const router = Router();

  router.get('/', validate({ query: schemas.search }), async (req, res) => {
    res.json(await listMovies(supabase.anon, req.valid.query));
  });

  return router;
}

function genresRouter({ supabase }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { data, error } = await supabase.anon
      .from('genres')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data);
  });

  return router;
}

module.exports = { moviesRouter, searchRouter, genresRouter };
