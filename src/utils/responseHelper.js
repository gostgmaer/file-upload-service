// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Error Codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
};

const sendSuccess = (res, { data = null, message = 'Success', statusCode = HTTP_STATUS.OK, meta = null } = {}) => {
  const response = { success: true, statusCode, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendError = (
  res,
  {
    message = 'Internal server error',
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code = ERROR_CODES.INTERNAL_ERROR,
    details = null,
    errors = null,
  } = {}
) => {
  const response = {
    success: false,
    statusCode,
    message,
    error: { code },
  };

  if (errors !== null) response.error.errors = errors;
  if (details !== null && process.env.NODE_ENV === 'development') response.error.details = details;

  return res.status(statusCode).json(response);
};

const sendCreated = (res, { data = null, message = 'Created successfully' } = {}) => {
  return sendSuccess(res, { data, message, statusCode: HTTP_STATUS.CREATED });
};

const sendNoContent = (res) => res.status(HTTP_STATUS.NO_CONTENT).send();

module.exports = {
  HTTP_STATUS,
  ERROR_CODES,
  sendSuccess,
  sendError,
  sendCreated,
  sendNoContent,
};
