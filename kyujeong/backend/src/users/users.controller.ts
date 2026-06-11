import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { UsersService } from './users.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: number;
    email: string;
  };
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMe(@Req() request: AuthenticatedRequest) {
    return this.usersService.findMe(request.user.sub);
  }
}
