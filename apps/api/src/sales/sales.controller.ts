import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SalesQueryDto } from '../reports/report.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AdminOnly } from '../auth/auth.decorators';
import type { User } from '@lee/shared';
import { CreateSaleDto, VoidSaleDto } from './sales.dto';
import { SalesService } from './sales.service';
@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}
  @AdminOnly() @Post(':id/void') void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoidSaleDto,
    @CurrentUser() user: User,
  ) {
    return this.sales.void(id, body.reason, user);
  }
  @Get() history(@Query() query: SalesQueryDto, @CurrentUser() user: User) {
    return this.sales.history(query, user);
  }
  @Post() create(@Body() body: CreateSaleDto, @CurrentUser() user: User) {
    return this.sales.create(body, user);
  }
  @Get(':id') receipt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.sales.receipt(id, user);
  }
}
