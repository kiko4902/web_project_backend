const Joi = require('joi');

const reviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  genre: Joi.string().optional(),
  minRating: Joi.number().min(0).max(10).optional(),
  year: Joi.number().integer().min(1900).max(new Date().getFullYear()).optional()
});

module.exports = {
  validateReview: (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
  },
  validateQuery: (req, res, next) => {
    const { error } = querySchema.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
  }
};