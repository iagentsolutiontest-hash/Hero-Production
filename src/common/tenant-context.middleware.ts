import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantStorage, TenantStore } from '../db/tenant-context';

/**
 * Opens an AsyncLocalStorage scope for every HTTP request so JwtAuthGuard
 * and PermissionsGuard can attach userId / organizationId, and the DB pool
 * can set PostgreSQL GUCs for Row Level Security.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const store: TenantStore = {
      userId: null,
      organizationId: null,
      bypassRls: false,
    };
    tenantStorage.run(store, () => next());
  }
}
