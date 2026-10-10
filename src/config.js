require('dotenv').config({ quiet: true });

const clean = (value) => (value || '').trim();

const list = (value) =>
  clean(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    supabaseUrl: clean(env.SUPABASE_URL),
    publishableKey: clean(env.SUPABASE_PUBLISHABLE_KEY),
    secretKey: clean(env.SUPABASE_SECRET_KEY),
    corsOrigins: list(env.CORS_ORIGINS || 'http://localhost:5173'),
    demoEmail: clean(env.DEMO_EMAIL),
    demoPassword: clean(env.DEMO_PASSWORD),
    rateLimit: {
      enabled: env.RATE_LIMIT_DISABLED !== 'true',
    },
  };
}

function assertConfig(config) {
  const missing = ['supabaseUrl', 'publishableKey'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for: ${missing.join(', ')}. See .env.example.`,
    );
  }
}

module.exports = { loadConfig, assertConfig };
