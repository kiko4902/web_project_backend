const supabase = require('../services/supabase');

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Authorization token required" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Attach full user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', user.id)
      .single();

    req.user = { ...user, username: profile?.username };
    next();
  } catch (err) {
    res.status(500).json({ error: "Authentication failed" });
  }
};