import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentsService],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return comment creation data temporarily', () => {
    expect(
      service.create(
        1,
        {
          content: 'Test comment',
        },
        2,
      ),
    ).toEqual({
      postId: 1,
      content: 'Test comment',
      authorId: 2,
    });
  });
});
