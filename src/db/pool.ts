import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getTenantStore } from './tenant-context';

let pool: Pool | null = null;
let patched = false;

async function applyTenantGucs(client: PoolClient): Promise<void> {
  const store = getTenantStore();
  if (store?.bypassRls) {
    await client.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
  } else {
    await client.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
  }
  await client.query(`SELECT set_config('app.current_user_id', $1, false)`, [
    store?.userId || '',
  ]);
  await client.query(`SELECT set_config('app.current_organization_id', $1, false)`, [
    store?.organizationId || '',
  ]);
}

async function clearTenantGucs(client: PoolClient): Promise<void> {
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'off', false)`);
    await client.query(`SELECT set_config('app.current_user_id', '', false)`);
    await client.query(`SELECT set_config('app.current_organization_id', '', false)`);
  } catch {
    // connection may already be broken
  }
}

function patchPool(p: Pool): void {
  if (patched) return;
  patched = true;

  const rawConnect = p.connect.bind(p);

  p.connect = (async () => {
    const client = await rawConnect();
    await applyTenantGucs(client);

    const origRelease = client.release.bind(client);
    let released = false;
    client.release = (err?: boolean | Error) => {
      if (released) {
        return origRelease(err as any);
      }
      released = true;
      clearTenantGucs(client)
        .catch(() => undefined)
        .finally(() => origRelease(err as any));
    };
    return client;
  }) as typeof p.connect;

  // Ensure pool.query also goes through tenant-aware connect
  const rawQuery = p.query.bind(p);
  p.query = (async (queryText: any, values?: any) => {
    // If no tenant store (background scripts without context), use raw path
    // but still prefer connect so GUCs are cleared defaults
    const client = await p.connect();
    try {
      if (typeof queryText === 'string') {
        return await client.query(queryText, values);
      }
      return await client.query(queryText);
    } finally {
      client.release();
    }
  }) as typeof p.query;

  // Keep a reference so tests can still use raw if needed
  (p as any).__rawQuery = rawQuery;
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.NODE_ENV === 'test'
        ? process.env.TEST_DATABASE_URL
        : process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'No database connection string set (DATABASE_URL / TEST_DATABASE_URL)',
      );
    }

    pool = new Pool({ connectionString });
    patchPool(pool);
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    patched = false;
  }
}

/** Run fn with RLS bypass (migrations, seeds, auth credential checks). */
export async function withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantContextAsync } = await import('./tenant-context');
  return runWithTenantContextAsync({ bypassRls: true }, fn);
}
