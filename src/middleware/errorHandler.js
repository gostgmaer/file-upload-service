const AppError = require('../utils/appError');
const { sendError, HTTP_STATUS, ERROR_CODES } = require('../utils/responseHelper');

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const handleMongoValidationError = (err) => {
  const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  return AppError.validation('Validation failed', errors);
};

const handleMongoDuplicateError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  return AppError.conflict(`Duplicate value for '${field}': ${value}`);
};

const handleMongoCastError = (err) => {
  if (err.path === '_id') {
    return AppError.badRequest(`Invalid file ID: '${err.value}' is not a valid ID`);
  }
  return AppError.badRequest(`Invalid value for '${err.path}': ${err.value}`);
};

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return AppError.create('File too large. Check the MAX_FILE_SIZE limit.', HTTP_STATUS.PAYLOAD_TOO_LARGE, ERROR_CODES.VALIDATION_ERROR);
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return AppError.create('Too many files. Maximum 10 files per request.', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return AppError.badRequest(`Unexpected field '${err.field}'. Use 'files' for multiple or 'file' for single upload.`);
  }
  return AppError.badRequest(`Upload error: ${err.message}`);
};

const handleJsonParseError = () => {
  return AppError.badRequest('Invalid JSON in request body. Please check your payload.');
};

const notFound = (req, res, next) => {
  const error = AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`);
  error.availableRoutes = {
    root: 'GET /',
    health: 'GET /health, GET /health/live, GET /health/ready',
    api: 'POST /api/files/upload, GET /api/files, GET /api/files/:id'
  };
  next(error);
};

const globalErrorHandler = (err, req, res, _next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  error.code = err.code || ERROR_CODES.INTERNAL_ERROR;

  // Mongoose errors
  if (err.name === 'ValidationError') error = handleMongoValidationError(err);
  if (err.code === 11000) error = handleMongoDuplicateError(err);
  if (err.name === 'CastError') error = handleMongoCastError(err);

  // Multer errors
  if (err.name === 'MulterError') error = handleMulterError(err);
  // Multer mime-type rejection (thrown from fileFilter)
  if (err.message && err.message.startsWith('File type') && err.message.includes('not allowed')) {
    error = AppError.create(err.message, 415, ERROR_CODES.VALIDATION_ERROR);
  }

  // JSON parse errors (Express body-parser)
  if (err.type === 'entity.parse.failed') error = handleJsonParseError();

  // MongoDB connection / timeout
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    error = AppError.create('Database connection error. Please try again.', 503, ERROR_CODES.INTERNAL_ERROR);
  }

  const isDev = process.env.NODE_ENV === 'development';

  console.error('Error:', {
    message: error.message,
    statusCode: error.statusCode,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(isDev && { stack: err.stack }),
  });

  return sendError(res, {
    message: error.isOperational ? error.message : 'Something went wrong. Please try again later.',
    statusCode: error.statusCode,
    code: error.code,
    details: isDev ? err.stack : null,
    errors: error.validationErrors || null,
  });
};

module.exports = { catchAsync, notFound, globalErrorHandler };
