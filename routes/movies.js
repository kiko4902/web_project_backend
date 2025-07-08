const router = require('express').Router();
const supabase = require('../services/supabase');
const { validateQuery } = require('../middlewares/validate');

// Get single movie with enhanced poster URL
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('movies')
      .select(`
        *,
        movie_genres(genres(name)),
        reviews!left(user_id, rating, comment, created_at)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Movie not found" });

    // Enhance poster URL if from Amazon
    const enhancedData = {
      ...data,
      poster_url: data.poster_url?.includes('m.media-amazon.com') 
        ? data.poster_url.replace('_V1_UX67_CR0,0,67,98_AL_', '_V1_UX512_CR0,0,512,750_AL_')
        : data.poster_url
    };

    res.json(enhancedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get paginated movie list with improved thumbnails
router.get('/', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('movies')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Improve thumbnails for all movies
    const enhancedMovies = data.map(movie => ({
      ...movie,
      poster_url: movie.poster_url?.includes('m.media-amazon.com')
        ? movie.poster_url.replace('_V1_UX67_CR0,0,67,98_AL_', '_V1_UX300_CR0,0,300,450_AL_')
        : movie.poster_url
    }));

    res.json({
      data: enhancedMovies,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get reviews for a movie (unchanged)
router.get('/:id/reviews', async (req, res) => {
  try {
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('movie_id', req.params.id)
      .order('created_at', { ascending: false });

    if (reviewsError) throw reviewsError;

    const reviewsWithUsers = await Promise.all(
      reviews.map(async review => {
        const { data: user, error: userError } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('user_id', review.user_id)
          .single();

        return {
          ...review,
          username: user?.username || 'deleted user'
        };
      })
    );

    res.json(reviewsWithUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;