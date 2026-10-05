import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipService } from '../tenancy/membership.service';
import { PERMISSION_KEY } from './require-permission.decorator';
import { setTenantOrganizationId } from '../../db/tenant-context';

/**
 * Runs AFTER JwtAuthGuard (which sets request.userId). Resolves the
 * caller's membership in the organization named by the x-organization-id
 * header, attaches it to the request as request.membership, and — if the
 * route declared @RequirePermission(...) — rejects with 403 unless the
 * resolved role actually has that permission key.
 *
 * This is deliberately the ONLY place that reads x-organization-id and
 * turns it into trusted tenant context; every downstream service should
 * receive organizationId as an explicit argument derived from
 * request.membership, never re-parse the header itself.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private membershipService: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.headers['x-organization-id'];

    if (!organizationId) {
      throw new BadRequestException('Missing x-organization-id header');
    }

    const membership = await this.membershipService.resolve(
      request.userId,
      organizationId,
    );

    if (!membership) {
      // Deliberately the same response whether the org doesn't exist or
      // the user just isn't a member of it — existence of another
      // tenant's org should not be leakable via a different error shape.
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }

    request.membership = membership;
    setTenantOrganizationId(membership.organizationId);

    const requiredPermission = this.reflector.get<string | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (requiredPermission && !membership.permissionKeys.has(requiredPermission)) {
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermission}`,
      );
    }

    return true;
  }
}
