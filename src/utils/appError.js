const { HTTP_STATUS, ERROR_CODES } = require('./responseHelper');

class AppError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || (statusCode >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST);
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details = null) {
    return new AppError(HTTP_STATUS.BAD_REQUEST, message, ERROR_CODES.BAD_REQUEST, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(HTTP_STATUS.UNAUTHORIZED, message, ERROR_CODES.UNAUTHORIZED);
  }

  static forbidden(message = 'Access denied') {
    return new AppError(HTTP_STATUS.FORBIDDEN, message, ERROR_CODES.FORBIDDEN);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(HTTP_STATUS.NOT_FOUND, message, ERROR_CODES.NOT_FOUND);
  }

  static conflict(message = 'Resource already exists') {
    return new AppError(HTTP_STATUS.CONFLICT, message, ERROR_CODES.DUPLICATE_ENTRY);
  }

  static validation(message = 'Validation failed', errors = null) {
    const error = new AppError(HTTP_STATUS.BAD_REQUEST, message, ERROR_CODES.VALIDATION_ERROR);
    error.validationErrors = errors;
    return error;
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new AppError(HTTP_STATUS.TOO_MANY_REQUESTS, message, ERROR_CODES.RATE_LIMIT_EXCEEDED);
  }

  static internal(message = 'Internal server error') {
    return new AppError(HTTP_STATUS.INTERNAL_SERVER_ERROR, message, ERROR_CODES.INTERNAL_ERROR);
  }

  static create(message, statusCode, code = null) {
    return new AppError(statusCode, message, code);
  }
}

module.exports = AppError;
