import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommentActionsController } from './comment-actions.controller';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CommentsController, CommentActionsController],
  providers: [CommentsService],
})
export class CommentsModule {}
