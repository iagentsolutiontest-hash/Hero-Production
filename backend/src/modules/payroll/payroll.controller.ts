import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PayrollService } from './payroll.service';

class CreateEmployeeDto {
  @IsString()
  fullName!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() annualSalary?: string;
  @IsOptional() @IsString() payFrequency?: string;
}

class CreatePayslipDto {
  @IsString() employeeId!: string;
  @IsString() periodStart!: string;
  @IsString() periodEnd!: string;
  @IsString() grossPay!: string;
}

@Controller('api/v1/payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(private payrollService: PayrollService) {}

  @Get('employees')
  @RequirePermission('org.manage')
  async listEmployees(@Req() req: any) {
    return { success: true, data: await this.payrollService.listEmployees(req.membership.organizationId) };
  }

  @Post('employees')
  @RequirePermission('org.manage')
  async createEmployee(@Req() req: any, @Body() dto: CreateEmployeeDto) {
    const emp = await this.payrollService.createEmployee(req.membership.organizationId, dto);
    return { success: true, data: emp };
  }

  @Get('payslips')
  @RequirePermission('org.manage')
  async listPayslips(@Req() req: any) {
    return { success: true, data: await this.payrollService.listPayslips(req.membership.organizationId) };
  }

  @Post('payslips')
  @RequirePermission('org.manage')
  async createPayslip(@Req() req: any, @Body() dto: CreatePayslipDto) {
    const slip = await this.payrollService.createDraftPayslip(req.membership.organizationId, dto);
    return { success: true, data: slip };
  }

  @Post('payslips/:id/post')
  @RequirePermission('org.manage')
  async postPayslip(@Req() req: any, @Param('id') id: string) {
    const result = await this.payrollService.postPayslip(req.membership.organizationId, id);
    return { success: true, data: result };
  }
}
