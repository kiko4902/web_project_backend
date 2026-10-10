const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { requireAuth } = require('./middleware/auth');
const { createLimiters } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { authRouter } = require('./routes/auth');
const { moviesRouter, searchRouter, genresRouter } = require('./routes/movies');
const { reviewsRouter } = require('./routes/reviews');
const { watchlistRouter } = require('./routes/watchlist');
const { usersRouter } = require('./routes/users');

// "https://app-*.vercel.app" style entries match preview deployments.
function originMatcher(allowed) {
  const patterns = allowed.map(
    (origin) =>
      new RegExp(`^${origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`),
  );
  return (origin) => patterns.some((pattern) => pattern.test(origin));
}

// Dependencies are passed in so tests can run the real app against fakes.
function createApp({ config, supabase }) {
  const app = express();
  const isAllowedOrigin = originMatcher(config.corsOrigins);
  const limiters = createLimiters({ supabase, config });
  const deps = { config, supabase, limiters, requireAuth: requireAuth(supabase) };

  // One proxy hop (Vercel) sits in front of the app; needed for the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      // Requests without an Origin header (curl, health checks) are not cross-origin.
      origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Runs a real query, so pinging it also counts as activity for Supabase's
  // inactivity pause on free projects.
  app.get('/health/db', async (req, res) => {
    const { error } = await supabase.anon.from('genres').select('id').limit(1);
    if (error) {
      console.error('Database health check failed:', error);
      return res.status(503).json({ status: 'error', database: 'down' });
    }
    res.json({ status: 'ok', database: 'up' });
  });

  app.use(limiters.general);

  app.use('/auth', authRouter(deps));
  app.use('/movies', moviesRouter(deps));
  app.use('/search', searchRouter(deps));
  app.use('/genres', genresRouter(deps));
  app.use('/reviews', reviewsRouter(deps));
  app.use('/watchlist', watchlistRouter(deps));
  app.use('/users', usersRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, originMatcher };
