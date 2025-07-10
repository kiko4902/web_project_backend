const router = require('express').Router();
const supabase = require('../services/supabase');
const authenticate = require('../middlewares/auth');

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

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_watchlist')
      .select(`
        added_at,
        movies(*)
      `)
      .eq('user_id', req.user.id);

    if (error) throw error;
    
    const formattedData = data.map(item => ({
      added_at: item.added_at,
      ...item.movies,
      poster_url: enhancePosterUrl(item.movies.poster_url)
    }));
    
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/toggle', authenticate, async (req, res) => {
  const { movie_id } = req.body;

  try {
    const { data: movie, error: movieError } = await supabase
      .from('movies')
      .select('id')
      .eq('id', movie_id)
      .single();

    if (movieError || !movie) {
      return res.status(404).json({ error: "Movie not found" });
    }
    const { data: existing, error: lookupError } = await supabase
      .from('user_watchlist')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('movie_id', movie_id);

    if (lookupError) throw lookupError;

    if (existing?.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_watchlist')
        .delete()
        .match({
          user_id: req.user.id,
          movie_id: movie_id
        });

      if (deleteError) throw deleteError;
      return res.json({ action: "removed", success: true });
    } else {
      const { data, error: insertError } = await supabase
        .from('user_watchlist')
        .insert({
          user_id: req.user.id,
          movie_id: movie_id
        })
        .select();

      if (insertError) throw insertError;
      return res.json({ action: "added", data });
    }
  } catch (err) {
    console.error("Toggle error:", err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;