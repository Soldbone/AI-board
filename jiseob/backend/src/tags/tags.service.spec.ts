import { BadRequestException } from '@nestjs/common';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  const service = new TagsService({} as never);

  it('normalizes tag names by trimming, removing hash prefixes, lowercasing, and deduplicating', () => {
    expect(service.normalizeTagNames(['  #News  ', 'news', 'AI  Debate'])).toEqual([
      'news',
      'ai debate',
    ]);
  });

  it('rejects an empty tag after normalization', () => {
    expect(() => service.normalizeTagNames(['###'])).toThrow(BadRequestException);
  });
});
