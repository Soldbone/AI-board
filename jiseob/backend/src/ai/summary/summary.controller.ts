import { Controller, Get, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { SummaryService } from './summary.service';

@Controller('comments/:rootCommentId/summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Post()
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async createSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rootCommentId') rootCommentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.summaryService.createSummary(user, rootCommentId);

    response.status(result.httpStatus ?? HttpStatus.ACCEPTED);

    return result.summary;
  }

  @Get()
  getSummary(@Param('rootCommentId') rootCommentId: string) {
    return this.summaryService.getSummary(rootCommentId);
  }
}
