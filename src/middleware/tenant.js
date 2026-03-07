const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';

const tenantMiddleware = (req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
  req.userId   = req.headers['x-user-id']   || null;
  req.userRole = req.headers['x-user-role'] || null;
  next();
};

module.exports = { tenantMiddleware };
