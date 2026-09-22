import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AiService } from './ai.service';

class AskDto {
  @IsString()
  @MaxLength(4000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;
}

@Controller('api/v1/ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('ask')
  @RequirePermission('ai.use')
  async ask(@Req() req: any, @Body() dto: AskDto) {
    const result = await this.aiService.ask(dto.prompt, { summary: dto.summary });
    return { success: true, data: result };
  }
}
