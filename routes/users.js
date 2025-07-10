const router = require('express').Router();
const supabase = require('../services/supabase');
const authenticate = require('../middlewares/auth');

router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/profile', authenticate, async (req, res, next) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ 
        user_id: req.user.id, 
        username 
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;