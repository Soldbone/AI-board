import { Module } from '@nestjs/common';
import { AuthCookieService } from './security/auth-cookie.service';
import { CsrfService } from './security/csrf.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  providers: [
    AuthCookieService,
    CsrfService,
    CsrfGuard,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthCookieService,
    CsrfService,
    CsrfGuard,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
  ],
})
export class CommonModule {}
