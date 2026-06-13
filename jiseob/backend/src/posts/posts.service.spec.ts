import { BadRequestException } from '@nestjs/common';
import { UserRole } from '../common/enums/user-role.enum';
import { PostsService } from './posts.service';

describe('PostsService', () => {
  const service = new PostsService({} as never, {} as never, {} as never, {} as never);
  const user = {
    id: '01J00000000000000000000000',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '01J00000000000000000000001',
  };

  it('rejects YouTube URL changes on post update', async () => {
    await expect(
      service.updatePost(user, '01J00000000000000000000002', {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
