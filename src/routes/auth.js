const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { HttpError, badRequest, unauthorized, conflict, notFound } = require('../lib/httpError');

// Only what the frontend needs; the full Supabase session object stays here.
const toSession = (session) =>
  session && {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };

function authRouter({ supabase, config, limiters }) {
  const router = Router();

  async function toAuthResponse({ user, session }) {
    const { data: profile } = await supabase.anon
      .from('user_profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      user: { id: user.id, email: user.email, username: profile?.username || null },
      session: toSession(session),
    };
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth().auth.signInWithPassword({ email, password });

    if (error) {
      if (error.code === 'email_not_confirmed') {
        throw new HttpError(403, 'Please confirm your email address before signing in');
      }
      if (error.status === 400 || error.code === 'invalid_credentials') {
        throw unauthorized('Invalid email or password');
      }
      if (error.status === 429) throw new HttpError(429, 'Too many attempts. Try again later.');
      throw error;
    }
    return toAuthResponse(data);
  }

  router.post(
    '/register',
    limiters.register,
    validate({ body: schemas.register }),
    async (req, res) => {
      const { email, password, username } = req.valid.body;

      if (username) {
        const { data: taken, error } = await supabase.anon
          .from('user_profiles')
          .select('user_id')
          .eq('username', username)
          .maybeSingle();
        if (error) throw error;
        if (taken) throw conflict('That username is already taken');
      }

      const { data, error } = await supabase.auth().auth.signUp({
        email,
        password,
        // Read by the handle_new_user trigger when it creates the profile row.
        options: { data: username ? { username } : {} },
      });

      if (error) {
        if (error.code === 'user_already_exists') {
          throw conflict('An account with this email already exists');
        }
        if (error.code === 'weak_password') throw badRequest(error.message);
        if (error.status === 429) {
          throw new HttpError(429, 'Too many sign-ups right now. Try again later.');
        }
        throw error;
      }

      // With email confirmation switched on in Supabase there is no session yet.
      if (!data.session) {
        return res.status(201).json({
          user: { id: data.user.id, email: data.user.email, username: username || null },
          session: null,
          message: 'Check your email to confirm your account',
        });
      }

      res.status(201).json(await toAuthResponse(data));
    },
  );

  router.post('/login', limiters.login, validate({ body: schemas.login }), async (req, res) => {
    const { email, password } = req.valid.body;
    res.json(await signIn(email, password));
  });

  // The demo credentials live only in the server's environment, so they are
  // never shipped in the frontend bundle.
  router.post('/demo', async (req, res) => {
    if (!config.demoEmail || !config.demoPassword) {
      throw notFound('The demo account is not available');
    }
    res.json(await signIn(config.demoEmail, config.demoPassword));
  });

  router.post('/refresh', validate({ body: schemas.refresh }), async (req, res) => {
    const { data, error } = await supabase
      .auth()
      .auth.refreshSession({ refresh_token: req.valid.body.refresh_token });

    if (error || !data.session) throw unauthorized('Session expired. Please sign in again.');
    res.json(await toAuthResponse(data));
  });

  return router;
}

module.exports = { authRouter };
