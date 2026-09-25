import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getTenantStore } from './tenant-context';

let pool: Pool | null = null;
let patched = false;

async function applyTenantGucs(client: PoolClient): Promise<void> {
  const store = getTenantStore();

  // Set all tenant GUCs in ONE database round trip.
  await client.query(
    `
      SELECT
        set_config('app.bypass_rls', $1, false),
        set_config('app.current_user_id', $2, false),
        set_config('app.current_organization_id', $3, false)
    `,
    [
      store?.bypassRls ? 'on' : 'off',
      store?.userId || '',
      store?.organizationId || '',
    ],
  );
}

async function clearTenantGucs(client: PoolClient): Promise<void> {
  try {
    // Reset all tenant GUCs in ONE database round trip.
    await client.query(
      `
        SELECT
          set_config('app.bypass_rls', 'off', false),
          set_config('app.current_user_id', '', false),
          set_config('app.current_organization_id', '', false)
      `,
    );
  } catch {
    // Connection may already be broken.
  }
}

function patchPool(p: Pool): void {
  if (patched) return;

  patched = true;

  const rawConnect = p.connect.bind(p);

  p.connect = (async () => {
    const client = await rawConnect();

    await applyTenantGucs(client);

    const originalRelease = client.release.bind(client);
    let released = false;

    client.release = (err?: boolean | Error) => {
      if (released) {
        return originalRelease(err as any);
      }

      released = true;

      clearTenantGucs(client)
        .catch(() => undefined)
        .finally(() => {
          originalRelease(err as any);
        });
    };

    return client;
  }) as typeof p.connect;

  const rawQuery = p.query.bind(p);

  p.query = (async (
    queryText: any,
    values?: any,
  ): Promise<any> => {
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

    pool = new Pool({
      connectionString,

      // Railway production settings
      max: Number(process.env.DB_POOL_MAX || 10),
      min: Number(process.env.DB_POOL_MIN || 2),

      idleTimeoutMillis: Number(
        process.env.DB_IDLE_TIMEOUT_MS || 30000,
      ),

      connectionTimeoutMillis: Number(
        process.env.DB_CONNECTION_TIMEOUT_MS || 5000,
      ),

      keepAlive: true,

      // Helpful for Railway/PostgreSQL connections
      maxLifetimeSeconds: Number(
        process.env.DB_MAX_LIFETIME_SECONDS || 300,
      ),
    });

    pool.on('error', (error) => {
      console.error('PostgreSQL pool error:', error);
    });

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

/**
 * Run function with RLS bypass.
 */
export async function withRlsBypass<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const { runWithTenantContextAsync } =
    await import('./tenant-context');

  return runWithTenantContextAsync(
    {
      bypassRls: true,
    },
    fn,
  );
}
