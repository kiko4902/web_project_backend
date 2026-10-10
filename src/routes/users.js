const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { conflict, notFound, PG_UNIQUE_VIOLATION } = require('../lib/httpError');

const PROFILE_COLUMNS = 'user_id, username, created_at';

function usersRouter({ requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/profile', async (req, res) => {
    const { data, error } = await req.db
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('Profile not found');
    res.json({ ...data, email: req.user.email });
  });

  router.put('/profile', validate({ body: schemas.profile }), async (req, res) => {
    const { username } = req.valid.body;

    const { data, error } = await req.db
      .from('user_profiles')
      .update({ username })
      .eq('user_id', req.user.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) throw conflict('That username is already taken');
      throw error;
    }
    // The sign-up trigger creates the row, so this only happens if it was removed by hand.
    if (!data) throw notFound('Profile not found');

    res.json({ ...data, email: req.user.email });
  });

  return router;
}

module.exports = { usersRouter };
