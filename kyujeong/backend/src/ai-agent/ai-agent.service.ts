import { Injectable } from '@nestjs/common';
import { AssistPostDraftDto } from './dto/assist-post-draft.dto';
import { PostDraftAgentRunner } from './post-draft-agent.runner';

@Injectable()
export class AiAgentService {
  constructor(private readonly postDraftAgentRunner: PostDraftAgentRunner) {}

  assistPostDraft(assistPostDraftDto: AssistPostDraftDto) {
    return this.postDraftAgentRunner.run(assistPostDraftDto);
  }
}
