async resolve(
  userId: string,
  organizationId: string,
): Promise<ResolvedMembership | null> {
  const pool = getPool();

  const result = await pool.query(
    `
      SELECT
        m.id AS membership_id,
        m.role_id,
        r.name AS role_name,
        COALESCE(
          json_agg(p.key) FILTER (WHERE p.key IS NOT NULL),
          '[]'
        ) AS permissions
      FROM memberships m
      JOIN roles r
        ON r.id = m.role_id
      LEFT JOIN role_permissions rp
        ON rp.role_id = r.id
      LEFT JOIN permissions p
        ON p.id = rp.permission_id
      WHERE m.user_id = $1
        AND m.organization_id = $2
        AND m.is_active = TRUE
      GROUP BY
        m.id,
        m.role_id,
        r.name
    `,
    [userId, organizationId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    membershipId: row.membership_id,
    userId,
    organizationId,
    roleId: row.role_id,
    roleName: row.role_name,
    permissionKeys: new Set(row.permissions || []),
  };
}
