const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const MINUTE = 60 * 1000;

// Counters kept in Postgres so the limit holds across serverless instances,
// where each instance has its own memory. Uses the admin client: the
// rate_limits table is not reachable with a publishable key.
class SupabaseStore {
  constructor(admin, prefix) {
    this.admin = admin;
    this.prefix = prefix;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  // IP addresses are personal data; only a hash is stored.
  key(key) {
    return `${this.prefix}:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  }

  async increment(key) {
    const { data, error } = await this.admin.rpc('rate_limit_hit', {
      p_key: this.key(key),
      p_window_ms: this.windowMs,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
  }

  async decrement(key) {
    await this.admin.rpc('rate_limit_decrement', { p_key: this.key(key) });
  }

  async resetKey(key) {
    await this.admin.rpc('rate_limit_reset', { p_key: this.key(key) });
  }
}

function createLimiters({ supabase, config }) {
  if (!config.rateLimit.enabled) {
    const off = (req, res, next) => next();
    return { general: off, login: off, register: off };
  }

  const admin = supabase.admin();
  const store = (prefix) => (admin ? new SupabaseStore(admin, prefix) : undefined);

  const base = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // If the counter store is unreachable, let the request through rather
    // than locking everyone out.
    passOnStoreError: true,
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
    },
  };

  return {
    // Whole API, in memory: a cheap guard against scraping and runaway clients.
    general: rateLimit({ ...base, windowMs: 15 * MINUTE, limit: 600 }),

    // Failed sign-ins only, so a user who types the right password is never
    // locked out by their own earlier requests. Two limits apply: a tight one
    // per address and account (guessing one password), and a looser one per
    // address (trying one password against many accounts).
    login: [
      rateLimit({
        ...base,
        windowMs: 15 * MINUTE,
        limit: 50,
        skipSuccessfulRequests: true,
        store: store('login-ip'),
      }),
      rateLimit({
        ...base,
        windowMs: 15 * MINUTE,
        limit: 10,
        skipSuccessfulRequests: true,
        store: store('login'),
        keyGenerator: (req) => {
          const email = typeof req.body?.email === 'string' ? req.body.email : '';
          return `${ipKeyGenerator(req.ip)}|${email.trim().toLowerCase().slice(0, 254)}`;
        },
      }),
    ],

    register: rateLimit({
      ...base,
      windowMs: 60 * MINUTE,
      limit: 10,
      store: store('register'),
    }),
  };
}

module.exports = { createLimiters, SupabaseStore };
