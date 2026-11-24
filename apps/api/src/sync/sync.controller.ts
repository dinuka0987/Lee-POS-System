import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { User } from '@lee/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { CreateSaleDto } from '../sales/sales.dto';
import { SalesService } from '../sales/sales.service';
@ApiTags('Offline sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sales: SalesService) {}
  @Post('sales') sale(@Body() body: CreateSaleDto, @CurrentUser() user: User) {
    return this.sales.create(body, user);
  }
}
