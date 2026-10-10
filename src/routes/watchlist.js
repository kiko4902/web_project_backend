const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { MOVIE_COLUMNS, toMovie } = require('../lib/movies');
const { notFound, PG_FOREIGN_KEY_VIOLATION } = require('../lib/httpError');

// Add and remove are separate, idempotent calls (PUT / DELETE) rather than a
// toggle, so a repeated or retried request can never flip the state back.
function watchlistRouter({ requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { data, error } = await req.db
      .from('user_watchlist')
      .select(`added_at, movies(${MOVIE_COLUMNS})`)
      .eq('user_id', req.user.id)
      .order('added_at', { ascending: false });

    if (error) throw error;
    res.json(
      data
        .filter((row) => row.movies)
        .map((row) => ({ ...toMovie(row.movies), added_at: row.added_at })),
    );
  });

  router.put('/:movieId', validate({ params: schemas.movieIdParam }), async (req, res) => {
    const { movieId } = req.valid.params;

    const { error } = await req.db
      .from('user_watchlist')
      .upsert(
        { user_id: req.user.id, movie_id: movieId },
        { onConflict: 'user_id,movie_id', ignoreDuplicates: true },
      );

    if (error) {
      if (error.code === PG_FOREIGN_KEY_VIOLATION) throw notFound('Movie not found');
      throw error;
    }
    res.json({ movie_id: movieId, in_watchlist: true });
  });

  router.delete('/:movieId', validate({ params: schemas.movieIdParam }), async (req, res) => {
    const { movieId } = req.valid.params;

    const { error } = await req.db
      .from('user_watchlist')
      .delete()
      .eq('user_id', req.user.id)
      .eq('movie_id', movieId);

    if (error) throw error;
    res.json({ movie_id: movieId, in_watchlist: false });
  });

  return router;
}

module.exports = { watchlistRouter };
