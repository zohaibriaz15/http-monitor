'use strict';

const logger = require('../logger');

// A typed error so route handlers can signal intended HTTP status codes.
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// 404 fallthrough for unmatched routes.
function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Not found: ${req.method} ${req.path}`));
}

// Central error handler. Express identifies it by its 4-arg signature.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  }
  res.status(status).json({
    error: {
      message: status >= 500 ? 'Internal server error' : err.message,
      status,
    },
  });
}

module.exports = { ApiError, notFoundHandler, errorHandler };
