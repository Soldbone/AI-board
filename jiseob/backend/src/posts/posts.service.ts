import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { TagResponse, TagsService } from '../tags/tags.service';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { VideoResponse, VideosService } from '../videos/videos.service';
import { CreatePostDto } from './dto/create-post.dto';
import { FindPostsQueryDto, PostSort } from './dto/find-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostLike } from './entities/post-like.entity';
import { PostTag } from './entities/post-tag.entity';
import { Post } from './entities/post.entity';

type PostAuthorResponse = {
  id: string;
  nickname: string;
};

export type PostListItemResponse = {
  id: string;
  title: string;
  contentPreview: string;
  youtubeUrl: string;
  commentCount: number;
  viewCount: number;
  likeCount: number;
  likedByMe: boolean | null;
  author: PostAuthorResponse;
  video: VideoResponse;
  tags: TagResponse[];
  createdAt: Date;
  updatedAt: Date;
};

export type PostResponse = PostListItemResponse & {
  content: string;
};

export type PaginatedPostsResponse = {
  items: PostListItemResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type PostWithRelations = Post & {
  author: User;
  video: Video;
  postTags: PostTag[];
};

@Injectable()
export class PostsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly videosService: VideosService,
    private readonly tagsService: TagsService,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly postLikesRepository: Repository<PostLike>,
  ) {}

  async createPost(user: AuthenticatedUser, createPostDto: CreatePostDto): Promise<PostResponse> {
    const { postId, videoId } = await this.dataSource.transaction(async (manager) => {
      const video = await this.videosService.findOrCreateByYoutubeUrl(
        createPostDto.youtubeUrl,
        manager,
      );
      const tags = await this.tagsService.findOrCreateByNames(createPostDto.tags, manager);
      const post = await manager.getRepository(Post).save(
        manager.getRepository(Post).create({
          authorId: user.id,
          videoId: video.id,
          title: createPostDto.title,
          content: createPostDto.content,
          youtubeUrl: createPostDto.youtubeUrl,
        }),
      );

      if (tags.length > 0) {
        await manager.getRepository(PostTag).insert(
          tags.map((tag) => ({
            postId: post.id,
            tagId: tag.id,
          })),
        );
      }

      return {
        postId: post.id,
        videoId: video.id,
      };
    });

    const response = await this.getPost(postId, user);

    void this.videosService.enqueueProcessing(videoId).catch(() => undefined);

    return response;
  }

  async findPosts(
    query: FindPostsQueryDto,
    user?: AuthenticatedUser,
  ): Promise<PaginatedPostsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const queryBuilder = this.postsRepository
      .createQueryBuilder('post')
      .withDeleted()
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.video', 'video')
      .leftJoinAndSelect('post.postTags', 'postTag')
      .leftJoinAndSelect('postTag.tag', 'tag')
      .where('post.deleted_at IS NULL')
      .skip((page - 1) * limit)
      .take(limit);

    const keyword = query.q?.trim();

    if (keyword) {
      queryBuilder.andWhere('(post.title ILIKE :keyword OR post.content ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }

    const tagName = this.tagsService.normalizeTagNames(query.tag ? [query.tag] : undefined)[0];

    if (tagName) {
      queryBuilder.andWhere(
        (subQueryBuilder) => {
          const subQuery = subQueryBuilder
            .subQuery()
            .select('filtered_post_tags.post_id')
            .from(PostTag, 'filtered_post_tags')
            .innerJoin('tags', 'filtered_tags', 'filtered_tags.id = filtered_post_tags.tag_id')
            .where('filtered_tags.name = :tagName')
            .getQuery();

          return `post.id IN ${subQuery}`;
        },
        { tagName },
      );
    }

    this.applyPostSort(queryBuilder, query.sort ?? 'latest');

    const [posts, total] = await queryBuilder.getManyAndCount();
    const likedPostIds = await this.findLikedPostIds(
      posts.map((post) => post.id),
      user,
    );

    return {
      items: posts.map((post) =>
        this.toPostListItemResponse(post as PostWithRelations, likedPostIds),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPost(postId: string, user?: AuthenticatedUser): Promise<PostResponse> {
    const post = await this.findActivePostWithRelations(postId);
    const likedPostIds = await this.findLikedPostIds([post.id], user);

    return this.toPostResponse(post, likedPostIds);
  }

  async updatePost(
    user: AuthenticatedUser,
    postId: string,
    updatePostDto: UpdatePostDto,
  ): Promise<PostResponse> {
    if (updatePostDto.youtubeUrl !== undefined) {
      throw new BadRequestException('게시글의 YouTube URL은 수정할 수 없습니다.');
    }

    if (
      updatePostDto.title === undefined &&
      updatePostDto.content === undefined &&
      updatePostDto.tags === undefined
    ) {
      throw new BadRequestException('수정할 값을 입력해주세요.');
    }

    await this.dataSource.transaction(async (manager) => {
      const post = await this.findActivePostEntityOrThrow(postId, manager);

      this.assertAuthor(post, user.id);

      if (updatePostDto.title !== undefined) {
        post.title = updatePostDto.title;
      }

      if (updatePostDto.content !== undefined) {
        post.content = updatePostDto.content;
      }

      await manager.getRepository(Post).save(post);

      if (updatePostDto.tags !== undefined) {
        const tags = await this.tagsService.findOrCreateByNames(updatePostDto.tags, manager);

        await manager.getRepository(PostTag).delete({ postId });

        if (tags.length > 0) {
          await manager.getRepository(PostTag).insert(
            tags.map((tag) => ({
              postId,
              tagId: tag.id,
            })),
          );
        }
      }
    });

    return this.getPost(postId, user);
  }

  async deletePost(user: AuthenticatedUser, postId: string): Promise<void> {
    const post = await this.findActivePostEntityOrThrow(postId);

    this.assertAuthor(post, user.id);

    await this.postsRepository.softDelete(postId);
  }

  async increaseViewCount(postId: string): Promise<{ viewCount: number }> {
    const result = await this.postsRepository
      .createQueryBuilder()
      .update(Post)
      .set({ viewCount: () => '"view_count" + 1' })
      .where('"id" = :postId', { postId })
      .andWhere('"deleted_at" IS NULL')
      .execute();

    if (!result.affected) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    const post = await this.findActivePostEntityOrThrow(postId);

    return { viewCount: post.viewCount };
  }

  async likePost(user: AuthenticatedUser, postId: string): Promise<{ likeCount: number }> {
    await this.dataSource.transaction(async (manager) => {
      await this.findActivePostEntityOrThrow(postId, manager);

      try {
        await manager.getRepository(PostLike).insert({
          postId,
          userId: user.id,
        });
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException('이미 좋아요한 게시글입니다.');
        }

        throw error;
      }

      await manager
        .getRepository(Post)
        .createQueryBuilder()
        .update(Post)
        .set({ likeCount: () => '"like_count" + 1' })
        .where('"id" = :postId', { postId })
        .execute();
    });

    const post = await this.findActivePostEntityOrThrow(postId);

    return { likeCount: post.likeCount };
  }

  async unlikePost(user: AuthenticatedUser, postId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.findActivePostEntityOrThrow(postId, manager);

      const deleteResult = await manager.getRepository(PostLike).delete({
        postId,
        userId: user.id,
      });

      if (!deleteResult.affected) {
        return;
      }

      await manager
        .getRepository(Post)
        .createQueryBuilder()
        .update(Post)
        .set({ likeCount: () => 'GREATEST("like_count" - 1, 0)' })
        .where('"id" = :postId', { postId })
        .execute();
    });
  }

  private async findActivePostWithRelations(postId: string): Promise<PostWithRelations> {
    const post = await this.postsRepository
      .createQueryBuilder('post')
      .withDeleted()
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.video', 'video')
      .leftJoinAndSelect('post.postTags', 'postTag')
      .leftJoinAndSelect('postTag.tag', 'tag')
      .where('post.id = :postId', { postId })
      .andWhere('post.deleted_at IS NULL')
      .getOne();

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    return post as PostWithRelations;
  }

  private async findActivePostEntityOrThrow(
    postId: string,
    manager?: EntityManager,
  ): Promise<Post> {
    const repository = manager?.getRepository(Post) ?? this.postsRepository;
    const post = await repository.findOne({
      where: { id: postId, deletedAt: IsNull() },
    });

    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }

    return post;
  }

  private assertAuthor(post: Post, userId: string): void {
    if (post.authorId !== userId) {
      throw new ForbiddenException('게시글에 대한 권한이 없습니다.');
    }
  }

  private applyPostSort(queryBuilder: SelectQueryBuilder<Post>, sort: PostSort): void {
    const sortColumns: Record<PostSort, string> = {
      latest: 'post.createdAt',
      comments: 'post.commentCount',
      likes: 'post.likeCount',
      views: 'post.viewCount',
    };
    const primarySortColumn = sortColumns[sort] ?? sortColumns.latest;

    queryBuilder.orderBy(primarySortColumn, 'DESC');

    if (primarySortColumn !== 'post.createdAt') {
      queryBuilder.addOrderBy('post.createdAt', 'DESC');
    }

    queryBuilder.addOrderBy('post.id', 'DESC');
  }

  private async findLikedPostIds(
    postIds: string[],
    user?: AuthenticatedUser,
  ): Promise<Set<string> | null> {
    if (!user || postIds.length === 0) {
      return null;
    }

    const likes = await this.postLikesRepository.find({
      select: {
        postId: true,
      },
      where: {
        postId: In(postIds),
        userId: user.id,
      },
    });

    return new Set(likes.map((like) => like.postId));
  }

  private toPostResponse(post: PostWithRelations, likedPostIds: Set<string> | null): PostResponse {
    return {
      ...this.toPostListItemResponse(post, likedPostIds),
      content: post.content,
    };
  }

  private toPostListItemResponse(
    post: PostWithRelations,
    likedPostIds: Set<string> | null,
  ): PostListItemResponse {
    return {
      id: post.id,
      title: post.title,
      contentPreview: this.createContentPreview(post.content),
      youtubeUrl: post.youtubeUrl,
      commentCount: post.commentCount,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
      likedByMe: likedPostIds ? likedPostIds.has(post.id) : null,
      author: this.toAuthorResponse(post),
      video: this.videosService.toVideoResponse(post.video),
      tags: this.toSortedTagResponses(post),
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  private toAuthorResponse(post: PostWithRelations): PostAuthorResponse {
    if (!post.author || post.author.deletedAt) {
      return {
        id: post.authorId,
        nickname: '탈퇴한 회원',
      };
    }

    return {
      id: post.author.id,
      nickname: post.author.nickname,
    };
  }

  private toSortedTagResponses(post: PostWithRelations): TagResponse[] {
    return (post.postTags ?? [])
      .map((postTag) => postTag.tag)
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((tag) => this.tagsService.toTagResponse(tag));
  }

  private createContentPreview(content: string): string {
    return content.length > 200 ? `${content.slice(0, 200)}...` : content;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
        '23505'
    );
  }
}
