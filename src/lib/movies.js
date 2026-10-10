const { withPosters } = require('./posters');

const MOVIE_COLUMNS =
  'id, title, overview, poster_url, certificate, runtime, imdb_rating, meta_score, no_of_votes, gross, release_date, avg_rating';

const SORT_COLUMNS = {
  title: 'title',
  year: 'release_date',
  rating: 'imdb_rating',
  votes: 'no_of_votes',
};

// % and _ are wildcards in LIKE; * is PostgREST's alias for %.
const escapeLike = (term) => term.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '');

// release_date holds a year (the column name is historical).
function toMovie(row) {
  const { release_date: year, ...rest } = withPosters(row);
  return { ...rest, year: year === null ? null : Number(year) };
}

// One query for both the movie list and search: filters, sort, one page, total.
async function listMovies(db, filters) {
  const { q, genres, minYear, maxYear, minRating, sortBy, order, page, limit } = filters;
  const filterByGenre = genres && genres.length > 0;

  // An inner join keeps only movies that have at least one of the genres.
  const columns = filterByGenre ? `${MOVIE_COLUMNS}, movie_genres!inner(genre_id)` : MOVIE_COLUMNS;

  let query = db.from('movies').select(columns, { count: 'exact' });

  if (q) query = query.ilike('title', `%${escapeLike(q)}%`);
  if (filterByGenre) query = query.in('movie_genres.genre_id', genres);
  if (minYear !== undefined) query = query.gte('release_date', minYear);
  if (maxYear !== undefined) query = query.lte('release_date', maxYear);
  if (minRating !== undefined) query = query.gte('imdb_rating', minRating);

  const from = (page - 1) * limit;
  const { data, error, count } = await query
    .order(SORT_COLUMNS[sortBy], { ascending: order === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + limit - 1);

  // PostgREST answers a page past the end with PGRST103; that is an empty page.
  if (error && error.code !== 'PGRST103') throw error;

  const rows = (data || []).map((row) => {
    const { movie_genres: _joined, ...movie } = row;
    return toMovie(movie);
  });
  const total = count ?? 0;

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

function toReview(row) {
  const { user_profiles: profile, username: _deprecated, ...review } = row;
  return { ...review, username: profile?.username || 'Anonymous' };
}

// Usernames come from user_profiles in the same query (no per-review lookups).
const REVIEW_COLUMNS =
  'id, user_id, movie_id, rating, comment, created_at, updated_at, user_profiles(username)';

module.exports = {
  MOVIE_COLUMNS,
  REVIEW_COLUMNS,
  SORT_COLUMNS,
  escapeLike,
  listMovies,
  toMovie,
  toReview,
};
