// Loads the movie catalog (movies, genres, movie_genres) from supabase/seed.sql.
// Refuses to run against a database that already has movies.
//
//   npm run db:seed
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'seed.sql'), 'utf8');
  const client = await connect();

  try {
    const { rows } = await client.query('select count(*)::int as count from public.movies');
    if (rows[0].count > 0) {
      console.log(`movies already has ${rows[0].count} rows; nothing to do`);
      return;
    }

    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }

    const counts = await client.query(`
      select (select count(*) from public.movies)::int as movies,
             (select count(*) from public.genres)::int as genres,
             (select count(*) from public.movie_genres)::int as movie_genres`);
    console.log('seeded', counts.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
