const { Client } = require('pg');

// Direct Postgres connection for migration and seed scripts only.
// The API itself never uses this; it goes through supabase-js so RLS applies.
async function connect() {
  const connectionString = (process.env.SUPABASE_DB_URL || '').trim();
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is not set');
  }

  const { hostname } = new URL(connectionString);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  const client = new Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

module.exports = { connect };
