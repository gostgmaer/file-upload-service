const TENANCY_ENABLED = process.env.TENANCY_ENABLED === "true";
// Tenant is resolved from x-tenant-id or DEFAULT_TENANT_ID fallback when tenancy is enabled.
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ? process.env.DEFAULT_TENANT_ID.trim() : "easydev";

const tenantMiddleware = (req, res, next) => {
	if (!TENANCY_ENABLED) {
		req.tenantId = null;
		req.userId = req.headers["x-user-id"] || null;
		req.userRole = req.headers["x-user-role"] || null;
		return next();
	}

	const tenantId = (req.headers["x-tenant-id"] || DEFAULT_TENANT_ID || "").trim();
	req.userId = req.headers["x-user-id"] || null;
	req.userRole = req.headers["x-user-role"] || null;

	if (!tenantId) {
		// Fallback tenant when no header is provided.
		req.tenantId = "easydev";
		return next();
	}

	req.tenantId = tenantId;
	next();
};

module.exports = { tenantMiddleware };
