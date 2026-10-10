class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
const forbidden = (message = 'Not allowed') => new HttpError(403, message);
const notFound = (message = 'Not found') => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

// Postgres / PostgREST error codes the API translates into client errors.
// Anything else is a server error and its message is never sent to the client.
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_INSUFFICIENT_PRIVILEGE = '42501';
const POSTGREST_NO_ROWS = 'PGRST116';

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  PG_UNIQUE_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_CHECK_VIOLATION,
  PG_INSUFFICIENT_PRIVILEGE,
  POSTGREST_NO_ROWS,
};
