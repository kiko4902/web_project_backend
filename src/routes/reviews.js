const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { REVIEW_COLUMNS, toReview } = require('../lib/movies');
const {
  conflict,
  forbidden,
  notFound,
  PG_UNIQUE_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
} = require('../lib/httpError');

// Every query here runs on req.db, the caller's own client. RLS is what stops
// a user writing someone else's review; the ownership check below only exists
// to answer with a clear 403 or 404 instead of "nothing happened".
function reviewsRouter({ requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  async function findOwnReview(req) {
    const { data: review, error } = await req.db
      .from('reviews')
      .select('id, user_id, movie_id')
      .eq('id', req.valid.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!review) throw notFound('Review not found');
    if (review.user_id !== req.user.id) throw forbidden('You can only change your own reviews');
    return review;
  }

  router.post(
    '/:movieId',
    validate({ params: schemas.movieIdParam, body: schemas.review }),
    async (req, res) => {
      const { rating, comment } = req.valid.body;

      const { data, error } = await req.db
        .from('reviews')
        .insert({
          user_id: req.user.id,
          movie_id: req.valid.params.movieId,
          rating,
          comment: comment || null,
        })
        .select(REVIEW_COLUMNS)
        .single();

      if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
          throw conflict('You have already reviewed this movie');
        }
        if (error.code === PG_FOREIGN_KEY_VIOLATION && /movie_id/.test(error.message)) {
          throw notFound('Movie not found');
        }
        throw error;
      }

      res.status(201).json(toReview(data));
    },
  );

  router.put(
    '/:id',
    validate({ params: schemas.idParam, body: schemas.review }),
    async (req, res) => {
      const review = await findOwnReview(req);
      const { rating, comment } = req.valid.body;

      // updated_at and the movie's average rating are maintained by triggers.
      const { data, error } = await req.db
        .from('reviews')
        .update({ rating, comment: comment || null })
        .eq('id', review.id)
        .select(REVIEW_COLUMNS)
        .single();

      if (error) throw error;
      res.json(toReview(data));
    },
  );

  router.delete('/:id', validate({ params: schemas.idParam }), async (req, res) => {
    const review = await findOwnReview(req);

    const { error } = await req.db.from('reviews').delete().eq('id', review.id);
    if (error) throw error;

    res.status(204).end();
  });

  return router;
}

module.exports = { reviewsRouter };
