const router = require('express').Router();
const supabase = require('../services/supabase');
const { authenticate } = require('../middlewares/auth');

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile
router.post('/profile', authenticate, async (req, res) => {
  const { username } = req.body;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ 
        user_id: req.user.id, 
        username 
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;