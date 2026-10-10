const { createClient } = require('@supabase/supabase-js');

// The server never keeps a session: each client is either anonymous, bound to
// one caller's access token, or the admin client.
const STATELESS_AUTH = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

function createSupabase(config) {
  const { supabaseUrl, publishableKey, secretKey } = config;

  // Public reads and token verification. No auth call that creates a session
  // is ever made on this client, so it always acts as the anon role.
  const anon = createClient(supabaseUrl, publishableKey, { auth: STATELESS_AUTH });

  let admin = null;

  return {
    anon,

    // signIn / signUp / refresh put a session on the client they run on, so
    // each of those calls gets a client of its own that is then discarded.
    auth() {
      return createClient(supabaseUrl, publishableKey, { auth: STATELESS_AUTH });
    },

    // All user data goes through a client that carries the caller's own
    // access token, so Postgres row level security decides what they can do.
    forToken(accessToken) {
      return createClient(supabaseUrl, publishableKey, {
        auth: STATELESS_AUTH,
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
    },

    // Bypasses RLS. Only for server-side bookkeeping that no user may touch
    // (currently the rate-limit counters). Null when no secret key is set.
    admin() {
      if (!secretKey) return null;
      if (!admin) {
        admin = createClient(supabaseUrl, secretKey, { auth: STATELESS_AUTH });
      }
      return admin;
    },
  };
}

module.exports = { createSupabase };
