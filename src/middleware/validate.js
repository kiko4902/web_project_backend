const { badRequest } = require('../lib/httpError');

// validate({ params, query, body }) checks each given part of the request
// against its Joi schema and puts the cleaned values on req.valid.
// (Express 5 makes req.query read-only, so the originals are left alone.)
function validate(schemas) {
  return (req, res, next) => {
    req.valid = req.valid || {};

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;

      const { value, error } = schemas[part].validate(req[part] ?? {}, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const details = error.details.map((detail) => detail.message);
        return next(badRequest(details[0], details));
      }
      req.valid[part] = value;
    }
    next();
  };
}

module.exports = { validate };
