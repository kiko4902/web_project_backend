// Applies supabase/migrations/*.sql in filename order, one transaction each,
// and records them in supabase_migrations.schema_migrations (the table the
// Supabase CLI uses, so `supabase db push` sees the same history).
//
//   npm run db:migrate                       apply everything pending
//   npm run db:migrate -- --status           list applied and pending
//   npm run db:migrate -- --baseline <ver>   record <ver> as applied without running it
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function readMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_.+\.sql$/.test(file))
    .sort()
    .map((file) => ({
      file,
      version: file.slice(0, 14),
      name: file.slice(15, -4),
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
    }));
}

async function main() {
  const args = process.argv.slice(2);
  const client = await connect();

  try {
    await client.query('create schema if not exists supabase_migrations');
    await client.query(`
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      )`);

    const { rows } = await client.query(
      'select version from supabase_migrations.schema_migrations',
    );
    const applied = new Set(rows.map((row) => row.version));
    const migrations = readMigrations();

    if (args[0] === '--status') {
      for (const m of migrations) {
        console.log(`${applied.has(m.version) ? 'applied' : 'pending'}  ${m.file}`);
      }
      return;
    }

    if (args[0] === '--baseline') {
      const target = migrations.find((m) => m.version === args[1]);
      if (!target) throw new Error(`No migration with version ${args[1]}`);
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, name)
         values ($1, $2) on conflict do nothing`,
        [target.version, target.name],
      );
      console.log(`recorded as applied (not run): ${target.file}`);
      return;
    }

    for (const m of migrations.filter((m) => !applied.has(m.version))) {
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query(
          `insert into supabase_migrations.schema_migrations (version, name, statements)
           values ($1, $2, $3)`,
          [m.version, m.name, [m.sql]],
        );
        await client.query('commit');
        console.log(`applied  ${m.file}`);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`${m.file} failed and was rolled back: ${err.message}`);
      }
    }
    console.log('database is up to date');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
