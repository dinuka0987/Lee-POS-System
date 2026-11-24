import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { User } from '@lee/shared';
export const Public = () => SetMetadata('public', true);
export const AdminOnly = () => SetMetadata('adminOnly', true);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<{ user: User }>().user,
);
