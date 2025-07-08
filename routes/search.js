const router = require('express').Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res) => {
  const { q, genre, minRating, year, sortBy = 'title', order = 'asc' } = req.query;

  try {
    let query = supabase
      .from('movies')
      .select(`
        *,
        movie_genres(genres(name))
      `, { count: 'exact' });

    // Text search
    if (q) {
      query = query.textSearch('title', q, {
        type: 'plain',
        config: 'english'
      });
    }

    // Genre filter
    if (genre) {
      query = query.in('movie_genres.genre_id', 
        supabase.from('genres').select('id').ilike('name', `%${genre}%`));
    }

    // Numeric filters
    if (minRating) query = query.gte('imdb_rating', minRating);
    if (year) query = query.eq('release_date', year);

    // Sorting
    const validSortFields = ['title', 'imdb_rating', 'release_date', 'meta_score'];
    if (validSortFields.includes(sortBy)) {
      query = query.order(sortBy, { ascending: order !== 'desc' });
    }

    const { data, error, count } = await query;

    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router; // Must export the router