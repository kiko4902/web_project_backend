const router = require('express').Router();
const supabase = require('../services/supabase');
const authenticate = require('../middlewares/auth');
const { validateReview } = require('../middlewares/validate');

// Submit review
router.post('/:movieId', authenticate, validateReview, async (req, res) => {
  const { rating, comment } = req.body;

  try {
    const { data, error } = await supabase
      .from('reviews')
      .upsert({
        user_id: req.user.id,
        movie_id: req.params.movieId,
        rating,
        comment,
        created_at: new Date()
      }, { onConflict: 'user_id,movie_id' })
      .select()
      .single();

    if (error) throw error;

    // Update movie average rating
    await updateMovieRating(req.params.movieId);

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function updateMovieRating(movieId) {
  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('movie_id', movieId);

  const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

  await supabase
    .from('movies')
    .update({ avg_rating: avgRating })
    .eq('id', movieId);
}
module.exports = router; // Must export the router