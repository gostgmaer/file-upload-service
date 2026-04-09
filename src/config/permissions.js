/**
 * RBAC Permission Definitions
 * 
 * Roles (aligned with API Gateway):
 * - anonymous: Public/unauthenticated users (no JWT) - can upload, view, download, and list files
 * - user: Authenticated users (JWT) - can also update, rename, and replace files
 * - admin: Full administrative access including delete and bulk operations
 * 
 * The API Gateway sets X-User-Role based on JWT payload:
 * - No JWT → X-User-Role: anonymous
 * - JWT without role field → X-User-Role: user
 * - JWT with role field → X-User-Role: <role from JWT>
 */

const ROLES = {
  ANONYMOUS: 'anonymous',  // Public users (no JWT)
  USER: 'user',            // Authenticated users (can modify their files)
  ADMIN: 'admin',          // Full administrative access
};

const PERMISSIONS = {
  // Public/Anonymous operations (no authentication required)
  FILE_UPLOAD: 'file:upload',
  FILE_VIEW: 'file:view',
  FILE_DOWNLOAD: 'file:download',
  FILE_LIST: 'file:list',
  
  // Authenticated user operations (requires user or admin role)
  FILE_UPDATE: 'file:update',
  FILE_RENAME: 'file:rename',
  FILE_REPLACE: 'file:replace',
  
  // Admin operations (requires admin role)
  FILE_DELETE: 'file:delete',
  FILE_PERMANENT_DELETE: 'file:permanent_delete',
  FILE_BULK_OPERATIONS: 'file:bulk_operations',
  FILE_TRANSACTIONS: 'file:transactions',
};

// Role-based permission matrix
const ROLE_PERMISSIONS = {
  // Anonymous/Public users can upload, view, download, and list
  [ROLES.ANONYMOUS]: [
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_LIST,
  ],
  
  // Authenticated users can also update, rename, and replace files
  [ROLES.USER]: [
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_LIST,
    PERMISSIONS.FILE_UPDATE,
    PERMISSIONS.FILE_RENAME,
    PERMISSIONS.FILE_REPLACE,
  ],
  
  // Admins have full access to everything
  [ROLES.ADMIN]: [
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.FILE_DOWNLOAD,
    PERMISSIONS.FILE_LIST,
    PERMISSIONS.FILE_UPDATE,
    PERMISSIONS.FILE_RENAME,
    PERMISSIONS.FILE_REPLACE,
    PERMISSIONS.FILE_DELETE,
    PERMISSIONS.FILE_PERMANENT_DELETE,
    PERMISSIONS.FILE_BULK_OPERATIONS,
    PERMISSIONS.FILE_TRANSACTIONS,
  ],
};

/**
 * Check if a role has a specific permission
 */
function hasPermission(role, permission) {
  // Default to anonymous if no role specified
  const userRole = role || ROLES.ANONYMOUS;
  const permissions = ROLE_PERMISSIONS[userRole];
  
  if (!permissions) {
    return false;
  }
  
  return permissions.includes(permission);
}

/**
 * Check if role is valid
 */
function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  isValidRole,
};
