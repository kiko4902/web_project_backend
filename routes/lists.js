const router = require('express').Router();
const supabase = require('../services/supabase');
const authenticate = require('../middlewares/auth');

// Create custom list
router.post('/', authenticate, async (req, res) => {
  const { name, isPrivate = true } = req.body;

  try {
    const { data, error } = await supabase
      .from('lists')
      .insert({
        user_id: req.user.id,
        name,
        is_private: isPrivate
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add movie to list
router.post('/:listId/movies', authenticate, async (req, res) => {
  const { movieId } = req.body;

  try {
    // Verify list ownership
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('id')
      .eq('id', req.params.listId)
      .eq('user_id', req.user.id)
      .single();

    if (listError || !list) {
      return res.status(404).json({ error: "List not found or access denied" });
    }

    const { data, error } = await supabase
      .from('list_movies')
      .insert({
        list_id: req.params.listId,
        movie_id: movieId
      })
      .select();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's lists with movies
router.get('/my', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lists')
      .select(`
        id,
        name,
        is_private,
        list_movies(
          movie_id,
          movies(title, poster_url)
      `)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router; // Must export the router