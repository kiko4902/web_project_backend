const router = require('express').Router();
const supabase = require('../services/supabase');

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
  const searchTerm = req.query.q || req.query.query || '';
  const minYear = parseInt(req.query.minYear) || 1900;
  const maxYear = parseInt(req.query.maxYear) || new Date().getFullYear();
  const genreIds = req.query.genres?.split(',').map(Number).filter(Boolean) || [];
  const sortBy = req.query.sortBy || 'title';

  try {
    let query = supabase
      .from('movies')
      .select('*');

    if (searchTerm) {
      query = query.textSearch('title', searchTerm, {
        type: 'plain',
        config: 'english'
      });
    }

    query = query
      .gte('release_date', `${minYear}.0`)
      .lte('release_date', `${maxYear}.0`);

    if (genreIds.length > 0) {
      const { data: genreMovies, error: genreError } = await supabase
        .from('movie_genres')
        .select('movie_id')
        .in('genre_id', genreIds);

      if (genreError) throw genreError;

      const movieIds = [...new Set(genreMovies.map(item => item.movie_id))];
      
      if (movieIds.length > 0) {
        query = query.in('id', movieIds);
      } else {
        return res.json([]);
      }
    }

    if (sortBy === 'title') {
      query = query.order('title', { ascending: true });
    } else if (sortBy === 'year') {
      query = query.order('release_date', { ascending: false });
    } else if (sortBy === 'rating') {
      query = query.order('imdb_rating', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    
    const enhancedMovies = data.map(movie => ({
      ...movie,
      poster_url: enhancePosterUrl(movie.poster_url)
    }));
    
    res.json(enhancedMovies || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;