const { unauthorized } = require('../lib/httpError');

// Verifies the bearer token with Supabase Auth, then gives the request a
// database client that acts as that user (req.db), so RLS is what authorizes
// every read and write that follows.
function requireAuth(supabase) {
  return async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(unauthorized('Authorization token required'));
    }

    const { data, error } = await supabase.anon.auth.getUser(token);
    if (error || !data?.user) {
      return next(unauthorized('Invalid or expired token'));
    }

    req.user = { id: data.user.id, email: data.user.email };
    req.db = supabase.forToken(token);
    next();
  };
}

module.exports = { requireAuth };
