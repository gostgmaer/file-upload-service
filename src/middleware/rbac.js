const crypto = require('crypto');
const AppError = require('../utils/appError');
const { isValidRole, ROLES } = require('../config/permissions');

/**
 * HMAC Verification Middleware (OPTIONAL)
 * Only verifies signature if gateway secret is configured AND HMAC header is provided
 * Allows standalone usage without API gateway for public endpoints
 */
function verifyGatewaySignature(req, res, next) {
  const gatewaySecret = process.env.GATEWAY_INTERNAL_SECRET;
  const providedHmac = req.headers['x-gateway-hmac'];
  
  // If no gateway secret configured OR no HMAC provided, skip verification
  // This allows standalone usage without API gateway
  if (!gatewaySecret || !providedHmac) {
    return next();
  }
  
  // If HMAC is provided, verify it
  const userId = req.headers['x-user-id'] || '';
  const userEmail = req.headers['x-user-email'] || '';
  const userRole = req.headers['x-user-role'] || '';
  
  // Calculate expected HMAC (same algorithm as gateway)
  const hmacPayload = `${userId}:${userEmail}:${userRole}`;
  const expectedHmac = crypto
    .createHmac('sha256', gatewaySecret)
    .update(hmacPayload)
    .digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) {
    return next(AppError.forbidden('Invalid gateway signature'));
  }
  
  next();
}

/**
 * Simple Role-Based Middleware
 * Checks if user has required role (no permission system)
 * 
 * Usage:
 *   router.get('/', allowPublic, getFiles);           // Anyone can access
 *   router.patch('/:id', requireAuth, updateFile);    // Requires authenticated user
 *   router.delete('/:id', requireAdmin, deleteFile);  // Requires admin
 * 
 * Works with or without API Gateway:
 * - With Gateway: Reads X-User-Role header (validated by HMAC)
 * - Standalone: Any request without role is treated as anonymous (public)
 */

/**
 * Allow public/anonymous access (no authentication required)
 * Always allows request to proceed
 */
function allowPublic(req, res, next) {
  // Public endpoint - anyone can access
  next();
}

/**
 * Require authenticated user (user or admin role)
 * Rejects anonymous users
 */
function requireAuth(req, res, next) {
  const userRole = req.userRole || ROLES.ANONYMOUS;
  
  // Validate role format
  if (userRole && !isValidRole(userRole)) {
    return next(AppError.badRequest(`Invalid role: ${userRole}. Valid roles: anonymous, user, admin`));
  }
  
  // Reject anonymous users
  if (userRole === ROLES.ANONYMOUS) {
    return next(AppError.unauthorized('Authentication required'));
  }
  
  next();
}

/**
 * Require admin role
 * Only allows admin users
 */
function requireAdmin(req, res, next) {
  const userRole = req.userRole || ROLES.ANONYMOUS;
  
  // Validate role format
  if (userRole && !isValidRole(userRole)) {
    return next(AppError.badRequest(`Invalid role: ${userRole}. Valid roles: anonymous, user, admin`));
  }
  
  // Only admins allowed
  if (userRole !== ROLES.ADMIN) {
    if (userRole === ROLES.ANONYMOUS) {
      return next(AppError.unauthorized('Admin authentication required'));
    }
    return next(AppError.forbidden('Admin role required'));
  }
  
  next();
}

/**
 * Middleware to require specific role or higher
 * Hierarchy: anonymous < user < admin
 */
function requireRole(minimumRole) {
  const roleHierarchy = {
    [ROLES.ANONYMOUS]: 0,
    [ROLES.USER]: 1,
    [ROLES.ADMIN]: 2,
  };
  
  return (req, res, next) => {
    const userRole = req.userRole || ROLES.ANONYMOUS;
    
    if (!isValidRole(userRole)) {
      return next(AppError.badRequest(`Invalid role: ${userRole}`));
    }
    
    const userLevel = roleHierarchy[userRole];
    const requiredLevel = roleHierarchy[minimumRole];
    
    if (userLevel < requiredLevel) {
      if (userRole === ROLES.ANONYMOUS || userRole === ROLES.USER) {
        return next(AppError.unauthorized(`Requires ${minimumRole} role or higher`));
      }
      return next(AppError.forbidden(`Requires ${minimumRole} role or higher. Your role: ${userRole}`));
    }
    
    next();
  };
}

/**
 * Middleware to check if user owns the resource
 * Admins bypass this check
 * Anonymous users cannot modify anything
 * Regular authenticated users must own the resource
 */
function requireOwnership(getResourceUserId) {
  return async (req, res, next) => {
    const userRole = req.userRole || ROLES.ANONYMOUS;
    const userId = req.userId;
    
    // Anonymous users cannot modify resources
    if (userRole === ROLES.ANONYMOUS) {
      return next(AppError.unauthorized('Authentication required to modify resources'));
    }
    
    // Admins bypass ownership checks
    if (userRole === ROLES.ADMIN) {
      return next();
    }
    
    // For authenticated users, check ownership
    if (userRole === ROLES.USER) {
      if (!userId || userId === 'anonymous') {
        return next(AppError.unauthorized('Valid user ID required for ownership verification'));
      }
      
      try {
        // Get resource owner ID (could be from DB or request)
        const resourceUserId = typeof getResourceUserId === 'function'
          ? await getResourceUserId(req)
          : getResourceUserId;
        
        if (resourceUserId !== userId) {
          return next(AppError.forbidden('You can only modify your own files'));
        }
        
        return next();
      } catch (error) {
        return next(error);
      }
    }
    
    return next(AppError.forbidden('Insufficient permissions to modify this resource'));
  };
}

module.exports = {
  verifyGatewaySignature,
  allowPublic,
  requireAuth,
  requireAdmin,
  requireRole,
  requireOwnership,
};
