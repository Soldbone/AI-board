import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { CsrfService } from '../security/csrf.service';

type CsrfRequest = Request & {
  user?: AuthenticatedUser;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrfService: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CsrfRequest>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const sessionId = request.user?.sessionId;

    if (!sessionId) {
      return false;
    }

    this.csrfService.verifyRequest(request, sessionId);

    return true;
  }
}
