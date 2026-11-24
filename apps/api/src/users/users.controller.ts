import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { User } from '@lee/shared';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../common/prisma.service';
const publicSelect = { id: true, name: true, email: true, role: true, active: true };
class PasswordDto {
  @ApiProperty({ format: 'password' }) @IsString() @MinLength(12) @MaxLength(72) password!: string;
}
class CreateUserDto extends PasswordDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) @Matches(/\S/) name!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
}
class UpdateUserDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/\S/)
  name?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
@ApiTags('Users')
@ApiBearerAuth()
@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly db: PrismaService) {}
  @Get() list() {
    return this.db.user.findMany({
      select: publicSelect,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }
  private password(value: string) {
    if (Buffer.byteLength(value) > 72)
      throw new BadRequestException('Password must be at most 72 UTF-8 bytes');
    return hash(value, 12);
  }
  @Post() async create(@Body() body: CreateUserDto, @CurrentUser() user: User) {
    const passwordHash = await this.password(body.password);
    try {
      return await this.db.$transaction(async (tx) => {
        const after = await tx.user.create({
          data: {
            name: body.name.trim(),
            email: body.email.trim().toLowerCase(),
            passwordHash,
            role: 'cashier',
          },
          select: publicSelect,
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            branchId: user.branchId,
            action: 'user.create',
            entity: 'user',
            entityId: after.id,
            details: { before: null, after },
          },
        });
        return after;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('This email already has an account');
      throw error;
    }
  }
  @Patch(':id') async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: publicSelect });
      if (!before) throw new NotFoundException('User not found');
      if (before.role === 'admin' && body.active === false)
        throw new BadRequestException('Administrator accounts cannot be disabled here');
      const after = await tx.user.update({
        where: { id },
        data: {
          ...body,
          ...(body.active !== undefined && body.active !== before.active
            ? { authVersion: { increment: 1 } }
            : {}),
        },
        select: publicSelect,
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          branchId: user.branchId,
          action: 'user.update',
          entity: 'user',
          entityId: id,
          details: { before, after },
        },
      });
      return after;
    });
  }
  @Post(':id/password') async reset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PasswordDto,
    @CurrentUser() user: User,
  ) {
    const passwordHash = await this.password(body.password);
    return this.db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: publicSelect });
      if (!before) throw new NotFoundException('User not found');
      await tx.user.update({
        where: { id },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          branchId: user.branchId,
          action: 'user.password-reset',
          entity: 'user',
          entityId: id,
          details: { account: { id, email: before.email }, sessionsRevoked: true },
        },
      });
      return { ok: true };
    });
  }
}
