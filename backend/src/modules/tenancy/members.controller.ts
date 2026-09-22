import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { getPool, withRlsBypass } from '../../db/pool';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  roleName!: string; // Owner cannot be assigned via invite — use Administrator etc.

  @IsOptional()
  @IsString()
  fullName?: string;
}

class UpdateRoleDto {
  @IsString()
  roleName!: string;
}

@Controller('api/v1/members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MembersController {
  @Get()
  @RequirePermission('org.manage')
  async list(@Req() req: any) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT m.id AS membership_id, u.id AS user_id, u.email, u.full_name,
              r.name AS role_name, m.is_active, m.created_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN roles r ON r.id = m.role_id
       WHERE m.organization_id = $1
       ORDER BY m.created_at ASC`,
      [req.membership.organizationId],
    );
    return { success: true, data: result.rows };
  }

  @Get('roles')
  @RequirePermission('org.manage')
  async listRoles(@Req() req: any) {
    const pool = getPool();
    // System roles (organization_id IS NULL)
    const result = await pool.query(
      `SELECT id, name FROM roles WHERE organization_id IS NULL ORDER BY name`,
    );
    return { success: true, data: result.rows };
  }

  /**
   * Invite (or attach) a user by email. If the user does not exist, a
   * placeholder account is created with a random password the inviter
   * must communicate out-of-band (no email gateway in this environment).
   * Returns a one-time tempPassword only when a new user was created.
   */
  @Post('invite')
  @RequirePermission('org.manage')
  async invite(@Req() req: any, @Body() dto: InviteMemberDto) {
    return withRlsBypass(async () => {
      if (dto.roleName === 'Owner') {
        throw new BadRequestException('Cannot assign the Owner role via invite');
      }

      const pool = getPool();
      const role = await pool.query(
        `SELECT id FROM roles WHERE organization_id IS NULL AND name = $1`,
        [dto.roleName],
      );
      if (role.rows.length === 0) {
        throw new BadRequestException(`Unknown role: ${dto.roleName}`);
      }

      let user = await pool.query(`SELECT id, email FROM users WHERE email = $1`, [
        dto.email.toLowerCase(),
      ]);

      let tempPassword: string | null = null;
      let userId: string;

      if (user.rows.length === 0) {
        tempPassword = randomBytes(9).toString('base64url').slice(0, 12);
        const hash = await argon2.hash(tempPassword, { type: argon2.argon2id });
        const created = await pool.query(
          `INSERT INTO users (email, password_hash, full_name)
           VALUES ($1, $2, $3) RETURNING id`,
          [dto.email.toLowerCase(), hash, dto.fullName || dto.email.split('@')[0]],
        );
        userId = created.rows[0].id;
      } else {
        userId = user.rows[0].id;
      }

      // Already a member?
      const existing = await pool.query(
        `SELECT id, is_active FROM memberships WHERE user_id = $1 AND organization_id = $2`,
        [userId, req.membership.organizationId],
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].is_active) {
          throw new ConflictException('User is already a member of this organization');
        }
        await pool.query(
          `UPDATE memberships SET is_active = TRUE, role_id = $1 WHERE id = $2`,
          [role.rows[0].id, existing.rows[0].id],
        );
      } else {
        await pool.query(
          `INSERT INTO memberships (user_id, organization_id, role_id) VALUES ($1, $2, $3)`,
          [userId, req.membership.organizationId, role.rows[0].id],
        );
      }

      return {
        success: true,
        data: {
          userId,
          email: dto.email.toLowerCase(),
          roleName: dto.roleName,
          tempPassword,
          note: tempPassword
            ? 'New user created. Share the temporary password securely; they should change it after first login.'
            : 'Existing user added to the organization.',
        },
      };
    });
  }

  @Patch(':membershipId/role')
  @RequirePermission('org.manage')
  async updateRole(
    @Req() req: any,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    if (dto.roleName === 'Owner') {
      throw new BadRequestException('Cannot promote to Owner via this endpoint');
    }
    const pool = getPool();
    const role = await pool.query(
      `SELECT id FROM roles WHERE organization_id IS NULL AND name = $1`,
      [dto.roleName],
    );
    if (role.rows.length === 0) {
      throw new BadRequestException(`Unknown role: ${dto.roleName}`);
    }

    const result = await pool.query(
      `UPDATE memberships SET role_id = $1
       WHERE id = $2 AND organization_id = $3
       RETURNING id`,
      [role.rows[0].id, membershipId, req.membership.organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('Membership not found');
    }
    return { success: true, data: { membershipId, roleName: dto.roleName } };
  }

  @Post(':membershipId/deactivate')
  @RequirePermission('org.manage')
  async deactivate(@Req() req: any, @Param('membershipId') membershipId: string) {
    // Prevent removing the last Owner
    const pool = getPool();
    const target = await pool.query(
      `SELECT m.id, r.name AS role_name, m.user_id
       FROM memberships m JOIN roles r ON r.id = m.role_id
       WHERE m.id = $1 AND m.organization_id = $2`,
      [membershipId, req.membership.organizationId],
    );
    if (target.rows.length === 0) {
      throw new NotFoundException('Membership not found');
    }
    if (target.rows[0].role_name === 'Owner') {
      const owners = await pool.query(
        `SELECT COUNT(*)::int AS n FROM memberships m
         JOIN roles r ON r.id = m.role_id
         WHERE m.organization_id = $1 AND m.is_active = TRUE AND r.name = 'Owner'`,
        [req.membership.organizationId],
      );
      if (owners.rows[0].n <= 1) {
        throw new BadRequestException('Cannot deactivate the last Owner');
      }
    }
    if (target.rows[0].user_id === req.userId) {
      throw new BadRequestException('Cannot deactivate your own membership');
    }

    await pool.query(
      `UPDATE memberships SET is_active = FALSE WHERE id = $1 AND organization_id = $2`,
      [membershipId, req.membership.organizationId],
    );
    return { success: true, data: { membershipId, is_active: false } };
  }
}