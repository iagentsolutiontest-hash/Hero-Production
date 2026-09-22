import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ContactService } from '../tenancy/contact.service';

class CreateContactDto {
  @IsIn(['CUSTOMER', 'SUPPLIER', 'BOTH'])
  type!: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class IdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

@Controller('api/v1/contacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContactsController {
  constructor(private contactService: ContactService) {}

  @Post()
  @RequirePermission('contact.create')
  async create(@Req() req: any, @Body() dto: CreateContactDto) {
    const contact = await this.contactService.create(req.membership.organizationId, dto);
    return { success: true, data: contact };
  }

  @Get()
  @RequirePermission('contact.read')
  async list(@Req() req: any) {
    const contacts = await this.contactService.listForOrg(req.membership.organizationId);
    return { success: true, data: contacts };
  }

  @Get(':id')
  @RequirePermission('contact.read')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const contact = await this.contactService.findByIdForOrg(req.membership.organizationId, id);
    return { success: true, data: contact };
  }

  @Get(':id/statement')
  @RequirePermission('contact.read')
  async getStatement(@Req() req: any, @Param('id') id: string) {
    const statement = await this.contactService.getStatement(req.membership.organizationId, id);
    return { success: true, data: statement };
  }

  @Post('bulk-delete')
  @RequirePermission('contact.update')
  async bulkDelete(@Req() req: any, @Body() body: IdsDto) {
    const result = await this.contactService.bulkDelete(req.membership.organizationId, body.ids || []);
    return { success: true, data: result };
  }

  @Delete(':id')
  @RequirePermission('contact.update')
  async remove(@Req() req: any, @Param('id') id: string) {
    const result = await this.contactService.deleteOne(req.membership.organizationId, id);
    return { success: true, data: result };
  }
}
