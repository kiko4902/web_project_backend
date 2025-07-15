const router = require('express').Router();
const supabase = require('../services/supabase');
const { validateQuery } = require('../middlewares/validate');

const enhancePosterUrl = (url) => {
  if (!url) return url;
  
  if (url.includes('m.media-amazon.com')) {
    return url
      .replace(/_V1_.*?\._/, '_V1_UY2000_CR0,0,1500,2000_AL_.')
      .replace(/@\..*?\.jpg$/, '@._V1_UY2000_CR0,0,1500,2000_AL_.jpg')
      .replace(/_V1_.*?_AL_/, '_V1_UY2000_CR0,0,1500,2000_AL_');
  }
  
  if (url.includes('themoviedb.org')) {
    return url
      .replace('/w185', '/w780')  
      .replace('/w342', '/w780'); 
  }
  return url;
};
router.get('/', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('movies')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const enhancedMovies = data.map(movie => ({
      ...movie,
      poster_url: enhancePosterUrl(movie.poster_url)
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

router.get('/search', async (req, res) => {
  const { query, year, rating, genre } = req.query;
  
  try {
    let queryBuilder = supabase
      .from('movies')
      .select('*');

    if (query) {
      queryBuilder = queryBuilder.ilike('title', `%${query}%`);
    }
    if (year) {
      queryBuilder = queryBuilder.eq('release_date', `${year}.0`);
    }
    if (rating) {
      const minRating = parseFloat(rating).toFixed(1);
      queryBuilder = queryBuilder.gte('imdb_rating', minRating);
    }
    if (genre) {
      queryBuilder = queryBuilder.ilike('genres', `%${genre}%`);
    }

    const { data, error } = await queryBuilder;

    if (error) throw error;
    
    const enhancedMovies = data.map(movie => ({
      ...movie,
      poster_url: enhancePosterUrl(movie.poster_url)
    }));

    res.json(enhancedMovies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    // Get movie data
    const { data: movie, error: movieError } = await supabase
      .from('movies')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (movieError) throw movieError;
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    // Get reviews separately
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('movie_id', req.params.id)
      .order('created_at', { ascending: false });

    if (reviewsError) throw reviewsError;

    // Process reviews to include usernames
    const processedReviews = await Promise.all(
      reviews.map(async (review) => {
        try {
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('user_id', review.user_id)
            .single();

          return {
            ...review,
            username: userProfile?.username || review.username || 'Anonymous'
          };
        } catch (err) {
          return {
            ...review,
            username: review.username || 'Anonymous'
          };
        }
      })
    );

    // Get genres if needed
    const { data: genres } = await supabase
      .from('movie_genres')
      .select('genres(name)')
      .eq('movie_id', req.params.id);

    const enhancedData = {
      ...movie,
      reviews: processedReviews,
      genres: genres?.map(g => g.genres) || [],
      poster_url: enhancePosterUrl(movie.poster_url)
    };

    res.json(enhancedData);
  } catch (err) {
    console.error('Error fetching movie:', err);
    res.status(500).json({ 
      error: 'Failed to fetch movie',
      details: err.message 
    });
  }
});

router.get('/:id/reviews', async (req, res) => {
  try {
    // First get all reviews for the movie
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('movie_id', req.params.id)
      .order('created_at', { ascending: false });

    if (reviewsError) throw reviewsError;

    // Then get usernames for each review
    const reviewsWithUsernames = await Promise.all(
      reviews.map(async (review) => {
        try {
          // Try to get username from user_profiles
          const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('user_id', review.user_id)
            .single();

          return {
            ...review,
            username: userProfile?.username || review.username || 'Anonymous'
          };
        } catch (err) {
          // Fallback if user profile fetch fails
          return {
            ...review,
            username: review.username || 'Anonymous'
          };
        }
      })
    );

    res.json(reviewsWithUsernames);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ 
      error: 'Failed to fetch reviews',
      details: err.message 
    });
  }
});

module.exports = router;