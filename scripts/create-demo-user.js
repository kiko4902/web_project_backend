// Creates the demo account from DEMO_EMAIL / DEMO_PASSWORD using the Supabase
// admin API (no confirmation email is sent). Safe to run again: an existing
// account is left as it is.
//
//   npm run demo:create
require('dotenv').config({ quiet: true });
const { loadConfig } = require('../src/config');
const { createSupabase } = require('../src/supabase');

async function main() {
  const config = loadConfig();
  if (!config.demoEmail || !config.demoPassword) {
    throw new Error('Set DEMO_EMAIL and DEMO_PASSWORD first');
  }

  const admin = createSupabase(config).admin();
  if (!admin) throw new Error('SUPABASE_SECRET_KEY is required to create users');

  const { data, error } = await admin.auth.admin.createUser({
    email: config.demoEmail,
    password: config.demoPassword,
    email_confirm: true,
    user_metadata: { username: 'demo' },
  });

  if (error) {
    if (error.code === 'email_exists' || error.status === 422) {
      console.log('demo account already exists');
      return;
    }
    throw error;
  }
  console.log(`demo account created (${data.user.id})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
