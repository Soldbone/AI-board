import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { McpServerService } from './mcp-server.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpServerService: McpServerService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  handleRequest(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.mcpServerService.handleRequest(body, { user });
  }
}
