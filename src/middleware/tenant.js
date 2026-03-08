// TENANCY_ENABLED=true  → x-tenant-id (or DEFAULT_TENANT_ID) is enforced; 400 if missing.
// TENANCY_ENABLED=false → tenant is optional; req.tenantId = null and the service continues.
const TENANCY_ENABLED   = process.env.TENANCY_ENABLED === 'true';
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID
  ? process.env.DEFAULT_TENANT_ID.trim()
  : null;

const tenantMiddleware = (req, res, next) => {
  const tenantId   = (req.headers['x-tenant-id'] || DEFAULT_TENANT_ID || '').trim();
  req.userId   = req.headers['x-user-id']   || null;
  req.userRole = req.headers['x-user-role'] || null;

  if (!tenantId) {
    if (TENANCY_ENABLED) {
      return res.status(400).json({
        success: false,
        message: 'Missing X-Tenant-Id header. Set DEFAULT_TENANT_ID in the service env or pass the header explicitly.',
      });
    }
    // Non-tenanted mode — continue without tenant scoping.
    req.tenantId = null;
    return next();
  }

  req.tenantId = tenantId;
  next();
};

module.exports = { tenantMiddleware };
