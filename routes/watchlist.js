const router = require('express').Router();
const supabase = require('../services/supabase');
const authenticate = require('../middlewares/auth');

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
    
    // Transform data to include movie details directly
    const formattedData = data.map(item => ({
      added_at: item.added_at,
      ...item.movies
    }));
    
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/toggle', authenticate, async (req, res) => {
  const { movie_id } = req.body;

  try {
    // 1. Verify movie exists
    const { data: movie, error: movieError } = await supabase
      .from('movies')
      .select('id')
      .eq('id', movie_id)
      .single();

    if (movieError || !movie) {
      return res.status(404).json({ error: "Movie not found" });
    }

    // 2. Check current watchlist status
    const { data: existing, error: lookupError } = await supabase
      .from('user_watchlist')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('movie_id', movie_id);

    if (lookupError) throw lookupError;

    // 3. Perform toggle action
    if (existing?.length > 0) {
      // DELETE operation with proper filtering
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
      // INSERT operation
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
module.exports = router; // Must export the router