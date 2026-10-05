import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformService } from './platform.service';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class PlatformController {
 constructor(private readonly service:PlatformService){}
 @Get(':module') list(@Req() req:any,@Param('module') module:string,@Query('q') q?:string){return this.service.list(req.membership.organizationId,module,q).then(data=>({success:true,data}));}
 @Post(':module') create(@Req() req:any,@Param('module') module:string,@Body() body:any){return this.service.create(req.membership.organizationId,module,body).then(data=>({success:true,data}));}
 @Patch(':module/:id') update(@Req() req:any,@Param('module') module:string,@Param('id') id:string,@Body() body:any){return this.service.update(req.membership.organizationId,module,id,body).then(data=>({success:true,data}));}
 @Delete(':module/:id') remove(@Req() req:any,@Param('module') module:string,@Param('id') id:string){return this.service.remove(req.membership.organizationId,module,id).then(data=>({success:true,data}));}
 @Post(':module/:id/status/:status') status(@Req() req:any,@Param('module') module:string,@Param('id') id:string,@Param('status') status:string){return this.service.action(req.membership.organizationId,module,id,status).then(data=>({success:true,data}));}
}
