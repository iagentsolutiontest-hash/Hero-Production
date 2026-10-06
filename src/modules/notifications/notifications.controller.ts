import { BadRequestException, Controller, Get, Headers, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { getPool } from '../../db/pool';

@Controller('api/v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  @Get()
  async list(@Req() req: { userId: string }, @Headers('x-organization-id') organizationId?: string) {
    if (!organizationId) throw new BadRequestException('Missing x-organization-id header');
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, title, message, type, read_at, data, created_at
       FROM notifications
       WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL)
       ORDER BY created_at DESC LIMIT 50`,
      [organizationId, req.userId],
    );
    return { success: true, data: result.rows };
  }

  @Patch(':id/read')
  async markRead(@Req() req: { userId: string }, @Headers('x-organization-id') organizationId: string | undefined, @Param('id') id: string) {
    if (!organizationId) throw new BadRequestException('Missing x-organization-id header');
    const pool = getPool();
    const result = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND organization_id = $2 AND (user_id = $3 OR user_id IS NULL)
       RETURNING id, read_at`,
      [id, organizationId, req.userId],
    );
    if (!result.rows.length) throw new BadRequestException('Notification not found');
    return { success: true, data: result.rows[0] };
  }
}
