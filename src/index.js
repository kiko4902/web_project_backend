const { loadConfig, assertConfig } = require('./config');
const { createSupabase } = require('./supabase');
const { createApp } = require('./app');

const config = loadConfig();
assertConfig(config);

// The configured app, with no listener: Vercel runs it as a function
// (api/index.js) and src/server.js listens on a port for local use.
module.exports = createApp({ config, supabase: createSupabase(config) });
module.exports.config = config;
