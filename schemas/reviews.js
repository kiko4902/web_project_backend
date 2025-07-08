const Joi = require('joi');

module.exports = {
  review: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(500).optional()
  })
};