import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { compare, hashSync } from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, Public } from './auth.decorators';
import type { User } from '@lee/shared';

class LoginDto {
  @ApiProperty({ example: 'cashier@lee.local' }) @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ format: 'password' }) @IsString() @MinLength(1) @MaxLength(72) password!: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly dummyHash = hashSync('unused-login-timing-placeholder', 12);
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto) {
    const account = await this.db.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
    });
    const valid = await compare(body.password, account?.passwordHash ?? this.dummyHash);
    if (!valid || !account?.active || Buffer.byteLength(body.password) > 72)
      throw new UnauthorizedException('Email or password is incorrect');
    const user: User = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      branchId: this.config.getOrThrow<string>('BRANCH_ID'),
    };
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, ver: account.authVersion }),
      user,
    };
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: User) {
    return user;
  }
}
