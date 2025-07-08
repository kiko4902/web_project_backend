const router = require('express').Router();
const supabase = require('../services/supabase');

// Login route (must exist)
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

    // First check if user exists
    const { data: { users }, error: lookupError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email);

    if (lookupError) throw lookupError;
    if (users && users.length > 0) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // If email is available, proceed with registration
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;
    
    res.json({
      user: data.user,
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
module.exports = router;