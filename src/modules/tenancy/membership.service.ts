import { ConflictException, Injectable } from '@nestjs/common';
import { getPool, withRlsBypass } from '../../db/pool';

export interface ResolvedMembership {
  membershipId: string;
  userId: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  permissionKeys: Set<string>;
}

@Injectable()
export class MembershipService {
  /** The single place that answers "can this user act in this org, and
   * with what permissions?" — used by both the PermissionsGuard and any
   * service that needs to double-check tenancy before a query. */
  async resolve(userId: string, organizationId: string): Promise<ResolvedMembership | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT m.id AS membership_id, m.role_id, r.name AS role_name,
              COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), ARRAY[]::text[]) AS permission_keys
       FROM memberships m
       JOIN roles r ON r.id = m.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE m.user_id = $1 AND m.organization_id = $2 AND m.is_active = TRUE
       GROUP BY m.id, m.role_id, r.name`,
      [userId, organizationId],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      membershipId: row.membership_id,
      userId,
      organizationId,
      roleId: row.role_id,
      roleName: row.role_name,
      permissionKeys: new Set<string>(row.permission_keys),
    };
  }

  async createOrganizationWithOwner(
    userId: string,
    orgName: string,
    countryCode: string,
  ): Promise<{ organizationId: string }> {
    return withRlsBypass(async () => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query(
          `SELECT 1 FROM memberships WHERE user_id = $1 AND is_active = TRUE LIMIT 1`,
          [userId],
        );
        if (existing.rows.length) {
          throw new ConflictException('This user already has an active company. One active company per user is supported.');
        }
        const orgResult = await client.query(
          `INSERT INTO organizations (name, country_code, subscription_status, trial_started_at, trial_ends_at)
           VALUES ($1, $2, 'trialing', now(), now() + INTERVAL '3 days') RETURNING id`,
          [orgName, countryCode],
        );
        const organizationId = orgResult.rows[0].id;

        const ownerRole = await client.query(
          `SELECT id FROM roles WHERE organization_id IS NULL AND name = 'Owner'`,
        );
        if (ownerRole.rows.length === 0) {
          throw new Error(
            'System role "Owner" not found — run the seed script before creating organizations',
          );
        }

        await client.query(
          `INSERT INTO memberships (user_id, organization_id, role_id) VALUES ($1, $2, $3)`,
          [userId, organizationId, ownerRole.rows[0].id],
        );

        await client.query(
          `INSERT INTO notifications (organization_id, user_id, title, message, type)
           VALUES ($1, $2, 'Welcome to Hero Accounting', 'Your company is ready. Your 3-day trial has started.', 'INFO')`,
          [organizationId, userId],
        );

        await client.query('COMMIT');
        return { organizationId };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  }
}