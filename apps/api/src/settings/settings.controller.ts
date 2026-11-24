import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  DEFAULT_DEVELOPER_CONTACT,
  DEFAULT_SHOP_SETTINGS,
  developerContactSchema,
  type User,
} from '@lee/shared';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../common/prisma.service';
class SettingsDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) @Matches(/\S/) name!: string;
  @ApiProperty() @IsString() @MaxLength(240) address!: string;
  @ApiProperty() @IsString() @MaxLength(60) phone!: string;
  @ApiProperty() @IsString() @MaxLength(240) receiptFooter!: string;
  @ApiProperty({ enum: [58, 80] }) @IsIn([58, 80]) paperWidthMm!: number;
  @ApiProperty() @IsBoolean() autoPrint!: boolean;
}
@ApiTags('Shop settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly db: PrismaService) {}
  @Get('developer')
  async getDeveloper(@CurrentUser() user: User) {
    const contact = await this.db.developerContact.findUnique({
      where: { branchId: user.branchId },
    });
    return contact
      ? developerContactSchema.parse({
          name: contact.name,
          email: contact.email,
          mobile: contact.mobile,
          facebookUrl: contact.facebookUrl,
          websiteUrl: contact.websiteUrl,
          supportHours: contact.supportHours,
        })
      : DEFAULT_DEVELOPER_CONTACT;
  }
  @Get() async get(@CurrentUser() user: User) {
    return (
      (await this.db.shopSetting.findUnique({ where: { branchId: user.branchId } })) ??
      DEFAULT_SHOP_SETTINGS
    );
  }
  @AdminOnly()
  @Put()
  async save(@Body() body: SettingsDto, @CurrentUser() user: User) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.shopSetting.findUnique({ where: { branchId: user.branchId } });
      const after = await tx.shopSetting.upsert({
        where: { branchId: user.branchId },
        create: { branchId: user.branchId, ...body },
        update: body,
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          branchId: user.branchId,
          action: 'settings.update',
          entity: 'shop',
          entityId: user.branchId,
          details: { before: before ?? DEFAULT_SHOP_SETTINGS, after },
        },
      });
      return after;
    });
  }
}
