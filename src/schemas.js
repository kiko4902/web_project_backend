const Joi = require('joi');

const MAX_PAGE_SIZE = 50;
const FIRST_YEAR = 1900;
const thisYear = () => new Date().getFullYear();

const id = Joi.number().integer().positive().required();

const email = Joi.string().trim().lowercase().email().max(254).required();
// bcrypt, which Supabase Auth uses, only reads the first 72 bytes.
const password = Joi.string().min(6).max(72).required();
const username = Joi.string()
  .trim()
  .pattern(/^[A-Za-z0-9_.-]+$/)
  .min(3)
  .max(30)
  .messages({
    'string.pattern.base':
      'Username may only contain letters, numbers, dots, dashes and underscores',
  });

const paging = {
  page: Joi.number().integer().min(1).max(10000).default(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(20),
};

// "1,5,12" -> [1, 5, 12]
const idList = Joi.string()
  .pattern(/^\d+(,\d+)*$/)
  .messages({ 'string.pattern.base': 'genres must be a comma-separated list of genre ids' })
  .custom((value) => [...new Set(value.split(',').map(Number))]);

const movieFilters = {
  genres: idList,
  minYear: Joi.number().integer().min(FIRST_YEAR).max(2100),
  maxYear: Joi.number().integer().min(FIRST_YEAR).max(2100),
  minRating: Joi.number().min(0).max(10),
  sortBy: Joi.string().valid('title', 'year', 'rating', 'votes').default('title'),
  order: Joi.string().valid('asc', 'desc'),
};

// Titles read best A-Z; years, ratings and votes read best highest first.
const withDefaultOrder = (value) => ({
  ...value,
  order: value.order || (value.sortBy === 'title' ? 'asc' : 'desc'),
});

module.exports = {
  MAX_PAGE_SIZE,
  FIRST_YEAR,
  thisYear,

  idParam: Joi.object({ id }),
  movieIdParam: Joi.object({ movieId: id }),

  movieList: Joi.object({ ...paging, ...movieFilters }).custom(withDefaultOrder),

  search: Joi.object({
    ...paging,
    ...movieFilters,
    q: Joi.string().trim().max(100).allow(''),
  }).custom(withDefaultOrder),

  register: Joi.object({ email, password, username }),
  login: Joi.object({ email, password: Joi.string().max(72).required() }),
  refresh: Joi.object({ refresh_token: Joi.string().max(4096).required() }),

  review: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().trim().min(1).max(500).allow(null, ''),
  }),

  profile: Joi.object({ username: username.required() }),
};
