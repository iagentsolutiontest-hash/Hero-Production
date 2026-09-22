import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  /** Authenticated user id (JWT sub) */
  userId?: string | null;
  /** Active organization from membership resolution */
  organizationId?: string | null;
  /** When true, RLS policies allow all rows (migrate, seed, auth login) */
  bypassRls?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | undefined {
  return tenantStorage.getStore();
}

export function runWithTenantContext<T>(store: TenantStore, fn: () => T): T {
  return tenantStorage.run({ ...store }, fn);
}

export async function runWithTenantContextAsync<T>(
  store: TenantStore,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run({ ...store }, fn);
}

/** Mutate the active store (same request). */
export function setTenantUserId(userId: string): void {
  const store = tenantStorage.getStore();
  if (store) store.userId = userId;
}

export function setTenantOrganizationId(organizationId: string): void {
  const store = tenantStorage.getStore();
  if (store) store.organizationId = organizationId;
}

export function setBypassRls(bypass: boolean): void {
  const store = tenantStorage.getStore();
  if (store) store.bypassRls = bypass;
}
