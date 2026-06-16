import { Controller, Get, Param } from '@nestjs/common';
import { RagService } from './rag.service';

@Controller('comments/:commentId/evidences')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Get()
  getEvidences(@Param('commentId') commentId: string) {
    return this.ragService.getEvidences(commentId);
  }
}
