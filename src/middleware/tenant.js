const AppError = require('../utils/appError');

const TENANCY_ENABLED = process.env.TENANCY_ENABLED === "true";
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ? process.env.DEFAULT_TENANT_ID.trim() : "easydev";

// Tenant ID validation regex: alphanumeric, dots, underscores, hyphens (3-63 chars)
const TENANT_ID_REGEX = /^[a-z0-9][a-z0-9._-]{2,62}$/i;

// User ID validation regex: alphanumeric, hyphens, underscores (3-100 chars) or "anonymous"
const USER_ID_REGEX = /^(anonymous|[a-z0-9][a-z0-9_-]{2,99})$/i;

/**
 * Tenant Middleware
 * Extracts and validates user context from API Gateway headers
 * 
 * Headers forwarded by API Gateway:
 * - X-User-Id: User identifier (or "anonymous" for public users)
 * - X-User-Email: User email (or "anonymous@example.com" for public)
 * - X-User-Role: User role (anonymous|user|editor|admin)
 * - X-Tenant-Id: Tenant identifier (multi-tenancy)
 * - X-Gateway-HMAC: HMAC signature for tamper prevention
 */
const tenantMiddleware = (req, res, next) => {
	// Extract user info from API gateway headers (already HMAC-verified)
	const rawUserId = req.headers["x-user-id"];
	const rawUserEmail = req.headers["x-user-email"];
	const rawUserRole = req.headers["x-user-role"];
	const rawUserName = req.headers["x-user-name"];
	
	// Set user info (validated and signed by API gateway)
	req.userId = rawUserId ? rawUserId.trim() : "anonymous";
	req.userEmail = rawUserEmail ? rawUserEmail.trim() : null;
	req.userName = rawUserName ? rawUserName.trim() : null;

	// Normalize IAM roles to file-service roles (anonymous | user | admin).
	// super_admin and service_account from IAM are full admins here.
	// member/customer are authenticated users.
	const iamRole = rawUserRole ? rawUserRole.toLowerCase().trim() : "anonymous";
	const IAM_ADMIN_ROLES = ["super_admin", "admin", "service_account"];
	const IAM_USER_ROLES  = ["member", "customer", "viewer"];
	if (IAM_ADMIN_ROLES.includes(iamRole)) {
		req.userRole = "admin";
	} else if (IAM_USER_ROLES.includes(iamRole)) {
		req.userRole = "user";
	} else {
		// "user", "admin", "anonymous" pass through as-is (standalone / direct usage)
		req.userRole = iamRole;
	}
	
	// Validate user ID format if not anonymous
	if (req.userId !== "anonymous" && !USER_ID_REGEX.test(req.userId)) {
		return next(AppError.badRequest('Invalid user ID format'));
	}
	
	// If tenancy is disabled, skip tenant logic
	if (!TENANCY_ENABLED) {
		req.tenantId = null;
		return next();
	}
	
	// Extract and validate tenant ID
	const rawTenantId = req.headers["x-tenant-id"];
	let tenantId = rawTenantId ? rawTenantId.trim() : DEFAULT_TENANT_ID;
	
	// Fallback to default if empty
	if (!tenantId) {
		tenantId = DEFAULT_TENANT_ID;
	}
	
	// Validate tenant ID format
	if (!TENANT_ID_REGEX.test(tenantId)) {
		return next(AppError.badRequest(
			'Invalid tenant ID format. Must be 3-63 characters: alphanumeric, dots, underscores, hyphens'
		));
	}
	
	req.tenantId = tenantId;
	next();
};

module.exports = { tenantMiddleware };
