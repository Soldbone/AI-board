import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type CurrentUserRequest = {
  user?: Record<string, unknown>;
};

export const CurrentUser = createParamDecorator(
  (data: string | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<CurrentUserRequest>();
    const user = request.user;

    if (!data) {
      return user;
    }

    return user?.[data];
  },
);
