const router = require('express').Router();
const supabase = require('../services/supabase');

router.post('/login', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: req.body.email,
      password: req.body.password
    });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      if (error.message.includes('already registered')) {
        return res.status(400).json({ error: "User already exists" });
      }
      throw error;
    }

    res.json({
      user: data.user,
      session: data.session, 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
module.exports = router;