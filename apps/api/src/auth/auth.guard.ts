import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import type { Request } from 'express';
import type { User } from '@lee/shared';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    const request = context.switchToHttp().getRequest<Request & { user: User }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Please sign in');
    let subject: string;
    let version: number;
    try {
      const claims = await this.jwt.verifyAsync<{ sub: string; ver?: number }>(token);
      if (typeof claims.sub !== 'string') throw new Error('Invalid subject');
      subject = claims.sub;
      version = claims.ver ?? 0;
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    const account = await this.db.user.findUnique({ where: { id: subject } });
    if (!account?.active || account.authVersion !== version)
      throw new UnauthorizedException('Account or session unavailable. Sign in again.');
    request.user = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      branchId: this.config.getOrThrow<string>('BRANCH_ID'),
    };
    if (this.reflector.getAllAndOverride<boolean>('adminOnly', targets) && account.role !== 'admin')
      throw new ForbiddenException('Administrator access required');
    return true;
  }
}
