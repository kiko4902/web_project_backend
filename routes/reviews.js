const router = require('express').Router();
const supabase = require('../services/supabase');
const authenticate = require('../middlewares/auth');
const { validateReview } = require('../middlewares/validate');

async function columnExists(tableName, columnName) {
  const { data, error } = await supabase
    .rpc('column_exists', {
      table_name: tableName,
      column_name: columnName
    });

  if (error) {
    console.error('Error checking column existence:', error);
    return false;
  }
  return data;
}

router.post('/:movieId', authenticate, validateReview, async (req, res) => {
  const { rating, comment } = req.body;
  const movieId = parseInt(req.params.movieId);
  
  const numericRating = Number(rating);
  if (isNaN(numericRating)) {
    return res.status(400).json({ error: 'Rating must be a valid number' });
  }

  if (isNaN(movieId)) {
    return res.status(400).json({ error: 'Invalid movie ID' });
  }

  try {
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', req.user.id)
      .single();

    if (profileError) throw profileError;
    if (!userProfile) throw new Error('User profile not found');

    const { data: existingReview, error: existingError } = await supabase
      .from('reviews')
      .select()
      .eq('user_id', req.user.id)
      .eq('movie_id', movieId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') throw existingError; 
    if (existingReview) {
      return res.status(400).json({ error: 'You already reviewed this movie' });
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        user_id: req.user.id,
        movie_id: movieId,
        rating,
        comment,
        username: userProfile.username, 
        created_at: new Date()
      })
      .select()
      .single();

    if (error) throw error;

    await updateMovieRating(movieId);

    res.status(201).json(data);
  } catch (err) {
    console.error('Review creation error:', err);
    res.status(500).json({ 
      error: 'Failed to create review',
      details: err.message 
    });
  }
});

async function updateMovieRating(movieId) {
  try {
    const hasAvgRating = await columnExists('movies', 'avg_rating');
    if (!hasAvgRating) {
      console.log('Skipping avg_rating update - column does not exist');
      return;
    }

    const { data: reviews, error: fetchError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('movie_id', movieId);

    if (fetchError) throw fetchError;

    if (reviews.length > 0) {
      const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
      
      const { error: updateError } = await supabase
        .from('movies')
        .update({ avg_rating: avgRating })
        .eq('id', movieId);

      if (updateError) throw updateError;
    }
  } catch (err) {
    console.error('Error updating movie rating:', err);
  }
}

router.delete('/:reviewId', authenticate, async (req, res) => {
  try {
    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select()
      .eq('id', req.params.reviewId)
      .single();

    if (fetchError) throw fetchError;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own reviews' });
    }

    const { error: deleteError } = await supabase
      .from('reviews')
      .delete()
      .eq('id', req.params.reviewId);

    if (deleteError) throw deleteError;

    await updateMovieRating(review.movie_id);

    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to delete review',
      details: err.message 
    });
  }
});

router.put('/:reviewId', authenticate, validateReview, async (req, res) => {
  const { rating, comment } = req.body;

  try {
    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select()
      .eq('id', req.params.reviewId)
      .single();

    if (fetchError) throw fetchError;
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own reviews' });
    }

    const updateData = {
      rating,
      comment
    };

    const hasUpdatedAt = await columnExists('reviews', 'updated_at');
    if (hasUpdatedAt) {
      updateData.updated_at = new Date();
    }

    const { data, error } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', req.params.reviewId)
      .select()
      .single();

    if (error) throw error;

    await updateMovieRating(review.movie_id);

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to update review',
      details: err.message 
    });
  }
});

module.exports = router;