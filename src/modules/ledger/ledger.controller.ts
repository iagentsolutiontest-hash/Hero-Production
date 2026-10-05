import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { LedgerService } from './ledger.service';

class CreateAccountDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COST_OF_GOODS_SOLD', 'EXPENSE'])
  type!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

class JournalLineDto {
  @IsString()
  accountCode!: string;

  @IsOptional()
  @IsString()
  debit?: string;

  @IsOptional()
  @IsString()
  credit?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

class ManualJournalDto {
  @IsString()
  entryDate!: string;

  @IsString()
  description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

@Controller('api/v1/ledger')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LedgerController {
  constructor(
    private chartOfAccountsService: ChartOfAccountsService,
    private ledgerService: LedgerService,
  ) {}

  // ── Chart of Accounts ──────────────────────────────────────────────────

  @Get('accounts')
  @RequirePermission('ledger.read')
  async listAccounts(@Req() req: any, @Query('includeArchived') includeArchived?: string) {
    const accounts = await this.chartOfAccountsService.listAccounts(
      req.membership.organizationId,
      includeArchived === 'true',
    );
    return { success: true, data: accounts };
  }

  @Post('accounts')
  @RequirePermission('ledger.post_manual')
  async createAccount(@Req() req: any, @Body() dto: CreateAccountDto) {
    const account = await this.chartOfAccountsService.createAccount(
      req.membership.organizationId,
      dto,
    );
    return { success: true, data: account };
  }

  // ── Manual Journal Entries ─────────────────────────────────────────────

  @Post('journals')
  @RequirePermission('ledger.post_manual')
  async postManualJournal(@Req() req: any, @Body() dto: ManualJournalDto) {
    const result = await this.ledgerService.postEntry({
      organizationId: req.membership.organizationId,
      entryDate: new Date(dto.entryDate),
      description: dto.description,
      sourceType: 'MANUAL',
      sourceId: undefined,
      lines: dto.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
      })),
    });
    return { success: true, data: { journalEntryId: result.id } };
  }

  @Get('journals')
  @RequirePermission('ledger.read')
  async listJournals(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const entries = await this.ledgerService.listEntries(
      req.membership.organizationId,
      {
        from: from || undefined,
        to: to || undefined,
        limit: limit ? parseInt(limit, 10) : 50,
      },
    );
    return { success: true, data: entries };
  }

  @Get('journals/:id')
  @RequirePermission('ledger.read')
  async getJournal(@Req() req: any, @Param('id') id: string) {
    const entry = await this.ledgerService.getEntryWithLines(
      req.membership.organizationId,
      id,
    );
    return { success: true, data: entry };
  }
}
