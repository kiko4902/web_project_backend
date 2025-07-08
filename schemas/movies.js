const Joi = require('joi');

module.exports = {
  moviePagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    genre: Joi.string().optional(),
    minRating: Joi.number().min(0).max(10).optional(),
    year: Joi.number().integer().min(1900).max(new Date().getFullYear()).optional(),
    sortBy: Joi.string().valid('title', 'imdb_rating', 'release_date', 'meta_score').default('title'),
    order: Joi.string().valid('asc', 'desc').default('asc')
  }),

  movieListOperation: Joi.object({
    movieId: Joi.number().integer().required(),
    listId: Joi.number().integer().optional()
  })
};