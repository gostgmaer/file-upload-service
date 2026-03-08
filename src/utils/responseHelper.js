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

/**
 * Recursively transform response data:
 *  - Renames `_id` → `id` (as string)
 *  - Removes `__v`
 */
const serialize = (val) => {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if (Buffer.isBuffer(val)) return val;
  if (Array.isArray(val)) return val.map(serialize);

  const src = typeof val.toJSON === 'function' ? val.toJSON() : val;
  if (typeof src !== 'object' || src === null) return src;

  const out = {};
  for (const key of Object.keys(src)) {
    if (key === '__v' || key === '_id' || key === 'id') continue;
    out[key] = serialize(src[key]);
  }
  const rawId = src.id !== undefined ? src.id : src._id;
  if (rawId !== undefined) out.id = String(rawId);

  return out;
};

const sendSuccess = (res, { data = null, message = 'Success', statusCode = HTTP_STATUS.OK } = {}) => {
  const response = { success: true, message };
  if (data !== null && data !== undefined) response.data = serialize(data);
  return res.status(statusCode).json(response);
};

const sendError = (
  res,
  {
    message = 'Internal server error',
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code = ERROR_CODES.INTERNAL_ERROR,
    details = null,
    hint = null,
  } = {}
) => {
  const err = { code };
  if (details !== null && details !== undefined) err.details = details;
  if (hint !== null && hint !== undefined) err.hint = hint;
  return res.status(statusCode).json({ success: false, message, error: err });
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
  serialize,
};
