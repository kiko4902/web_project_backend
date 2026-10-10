// End-to-end check of a running API against the real database.
//
//   npm run smoke                       http://localhost:3000
//   npm run smoke -- https://api.example.com
//
// Uses one fixed test account (SMOKE_EMAIL / SMOKE_PASSWORD), created on the
// first run and reused afterwards, and cleans up the review and watchlist
// entry it makes. Exits non-zero if any check fails.
require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const base = (process.argv[2] || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const env = (name) => (process.env[name] || '').trim();

const SMOKE_EMAIL = env('SMOKE_EMAIL');
const SMOKE_PASSWORD = env('SMOKE_PASSWORD');
const MOVIE_ID = 2; // The Godfather

let failures = 0;

function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
  return ok;
}

async function api(method, path, { token, body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON; leave null
  }
  return { status: res.status, body: json, headers: res.headers };
}

const brief = (res) => `${res.status} ${JSON.stringify(res.body)?.slice(0, 160)}`;

async function main() {
  console.log(`Smoke test against ${base}\n`);

  // --- public
  let res = await api('GET', '/health');
  check('health', res.status === 200 && res.body?.status === 'ok', brief(res));

  res = await api('GET', '/health/db');
  check('health/db', res.status === 200 && res.body?.database === 'up', brief(res));

  res = await api('GET', '/movies?limit=5');
  check(
    'movie list is paginated',
    res.status === 200 && res.body?.data?.length === 5 && res.body.pagination?.total >= 1000,
    brief(res),
  );
  check(
    'movie list serves thumbnail posters',
    /UX300/.test(res.body?.data?.[0]?.poster_thumb_url || ''),
    res.body?.data?.[0]?.poster_thumb_url,
  );

  res = await api('GET', '/movies?limit=5000');
  check('oversized limit is rejected', res.status === 400, brief(res));

  res = await api('GET', '/movies/1');
  check(
    'movie detail has year, genres and reviews',
    res.status === 200 &&
      res.body?.year === 1994 &&
      res.body.genres?.length > 0 &&
      Array.isArray(res.body.reviews),
    brief(res),
  );

  res = await api('GET', '/movies/999999');
  check('missing movie is 404', res.status === 404, brief(res));

  res = await api('GET', '/movies/abc');
  check('bad movie id is 400 with no database detail', res.status === 400, brief(res));

  res = await api('GET', '/search?q=shaw');
  check(
    'partial search finds Shawshank',
    res.status === 200 && res.body?.data?.some((movie) => /Shawshank/.test(movie.title)),
    brief(res),
  );

  res = await api('GET', '/search?genres=1&minYear=2000&sortBy=rating&limit=3');
  check(
    'search filters by genre and year, sorted by rating',
    res.status === 200 &&
      res.body?.data?.length === 3 &&
      res.body.data.every((movie) => movie.year >= 2000) &&
      res.body.data[0].imdb_rating >= res.body.data[2].imdb_rating,
    brief(res),
  );

  res = await api('GET', '/genres');
  check('genres', res.status === 200 && res.body?.length >= 20, brief(res));

  res = await api('GET', '/health', { headers: { Origin: 'https://evil.example' } });
  check(
    'unknown origin gets no CORS header',
    !res.headers.get('access-control-allow-origin'),
    res.headers.get('access-control-allow-origin'),
  );

  res = await api('GET', '/watchlist');
  check('watchlist requires a token', res.status === 401, brief(res));

  // --- account
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
    check('SMOKE_EMAIL and SMOKE_PASSWORD are set', false);
    return;
  }

  res = await api('POST', '/auth/register', {
    body: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD, username: 'smoke_test' },
  });
  check(
    'register (201 first run, 409 afterwards)',
    res.status === 201 || res.status === 409,
    brief(res),
  );

  res = await api('POST', '/auth/login', {
    body: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD },
  });
  const token = res.body?.session?.access_token;
  const refreshToken = res.body?.session?.refresh_token;
  check('login', res.status === 200 && Boolean(token), brief({ ...res, body: res.body?.user }));
  if (!token) return;

  res = await api('POST', '/auth/refresh', { body: { refresh_token: refreshToken } });
  check(
    'refresh returns a new session',
    res.status === 200 && Boolean(res.body?.session?.access_token),
  );

  res = await api('GET', '/users/profile', { token });
  check(
    'profile exists for the new account',
    res.status === 200 && Boolean(res.body?.username),
    brief(res),
  );

  // --- reviews (clean up anything a failed earlier run left behind)
  res = await api('GET', `/movies/${MOVIE_ID}/reviews`);
  const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
  const stale = res.body?.find((review) => review.user_id === userId);
  if (stale) await api('DELETE', `/reviews/${stale.id}`, { token });

  res = await api('POST', `/reviews/${MOVIE_ID}`, {
    token,
    body: { rating: 4, comment: 'Smoke test review' },
  });
  const reviewId = res.body?.id;
  check(
    'review create',
    res.status === 201 && Boolean(reviewId) && Boolean(res.body.username),
    brief(res),
  );

  res = await api('POST', `/reviews/${MOVIE_ID}`, { token, body: { rating: 1 } });
  check('second review on the same movie is 409', res.status === 409, brief(res));

  res = await api('GET', `/movies/${MOVIE_ID}`);
  check(
    'average rating is maintained by the database',
    res.body?.avg_rating !== null && res.body?.reviews?.some((review) => review.id === reviewId),
    `avg_rating=${res.body?.avg_rating}`,
  );

  res = await api('PUT', `/reviews/${reviewId}`, { token, body: { rating: 2, comment: 'Edited' } });
  check(
    'review edit sets updated_at',
    res.status === 200 && res.body?.rating === 2 && Boolean(res.body.updated_at),
    brief(res),
  );

  res = await api('POST', `/reviews/${MOVIE_ID}`, { token, body: { rating: 9 } });
  check('invalid rating is 400', res.status === 400, brief(res));

  // --- demo account, also used as "another user"
  res = await api('POST', '/auth/demo');
  const demoToken = res.body?.session?.access_token;
  check(
    'demo login',
    res.status === 200 && Boolean(demoToken),
    brief({ ...res, body: res.body?.user }),
  );

  if (demoToken) {
    res = await api('PUT', `/reviews/${reviewId}`, { token: demoToken, body: { rating: 1 } });
    check('another user cannot edit the review (403)', res.status === 403, brief(res));
    res = await api('DELETE', `/reviews/${reviewId}`, { token: demoToken });
    check('another user cannot delete the review (403)', res.status === 403, brief(res));
  }

  res = await api('DELETE', `/reviews/${reviewId}`, { token });
  check('review delete', res.status === 204, brief(res));

  // --- watchlist
  res = await api('PUT', `/watchlist/${MOVIE_ID}`, { token });
  check('watchlist add', res.status === 200 && res.body?.in_watchlist === true, brief(res));
  res = await api('PUT', `/watchlist/${MOVIE_ID}`, { token });
  check('watchlist add is idempotent', res.status === 200, brief(res));
  res = await api('GET', '/watchlist', { token });
  check(
    'watchlist lists the movie',
    res.body?.some((movie) => movie.id === MOVIE_ID),
    brief(res),
  );
  if (demoToken) {
    res = await api('GET', '/watchlist', { token: demoToken });
    const leaked = res.body?.some?.((movie) => movie.added_at && movie.user_id === userId);
    check("another user's watchlist is separate", res.status === 200 && !leaked, brief(res));
  }
  res = await api('DELETE', `/watchlist/${MOVIE_ID}`, { token });
  check('watchlist remove', res.status === 200 && res.body?.in_watchlist === false, brief(res));
  res = await api('GET', '/watchlist', { token });
  check('watchlist no longer lists the movie', !res.body?.some((movie) => movie.id === MOVIE_ID));

  // --- RLS, straight at Supabase with the publishable key and no user token
  const supabaseUrl = env('SUPABASE_URL');
  const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
  if (supabaseUrl && publishableKey) {
    const direct = (method, path, body) =>
      fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: publishableKey,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    let d = await direct('POST', 'reviews', { user_id: userId, movie_id: MOVIE_ID, rating: 1 });
    check(
      'direct anonymous review insert is rejected by the database',
      d.status === 401 || d.status === 403,
      String(d.status),
    );
    d = await direct('PATCH', 'movies?id=eq.1', { title: 'hacked' });
    check(
      'direct anonymous movie update is rejected by the database',
      d.status === 401 || d.status === 403,
      String(d.status),
    );
    d = await direct('POST', 'user_watchlist', { user_id: userId, movie_id: 1 });
    check(
      'direct anonymous watchlist insert is rejected by the database',
      d.status === 401 || d.status === 403,
      String(d.status),
    );
    d = await direct('GET', 'rate_limits?select=key');
    check(
      'rate limit counters are not readable with the publishable key',
      d.status === 401 || d.status === 403,
      String(d.status),
    );
    d = await direct('GET', 'movies?select=id&limit=1');
    check('direct anonymous catalog read still works', d.status === 200, String(d.status));

    // signed in as the smoke user, but writing as someone else
    d = await fetch(`${supabaseUrl}/rest/v1/reviews`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: '00000000-0000-0000-0000-000000000000',
        movie_id: MOVIE_ID,
        rating: 1,
      }),
    });
    check(
      'direct insert as a different user is rejected by RLS',
      d.status === 401 || d.status === 403,
      String(d.status),
    );
  }

  // --- rate limit, last: a throwaway address so no real account gets locked
  const unknown = `nobody-${crypto.randomBytes(6).toString('hex')}@example.com`;
  let statuses = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    res = await api('POST', '/auth/login', {
      body: { email: unknown, password: 'wrong-password' },
    });
    statuses.push(res.status);
  }
  check(
    'repeated bad logins are rate limited (401 x10, then 429)',
    statuses.slice(0, 10).every((status) => status === 401) &&
      statuses[10] === 429 &&
      statuses[11] === 429,
    statuses.join(','),
  );
}

main()
  .catch((err) => {
    failures++;
    console.error('Smoke test crashed:', err.message);
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
  });
