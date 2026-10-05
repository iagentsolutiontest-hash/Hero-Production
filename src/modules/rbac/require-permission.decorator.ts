import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/** Marks a route as requiring a given permission key (e.g. 'invoice.create').
 * Checked server-side by PermissionsGuard — never trust a hidden button. */
export const RequirePermission = (permissionKey: string) =>
  SetMetadata(PERMISSION_KEY, permissionKey);
