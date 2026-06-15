import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  FileText,
  Heart,
  LogIn,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { ApiRequestError } from '@/api/client';
import { listComments } from '@/api/comments';
import { getPost, incrementPostView, listPosts, listTags } from '@/api/posts';
import { getVideo } from '@/api/videos';
import type {
  AiAnalysisStatus,
  CommentResponse,
  CommentType,
  ModerationStatus,
  PaginatedResponse,
  PaginationMeta,
  PostListItemResponse,
  PostResponse,
  RagStatus,
  TagResponse,
  VideoProcessingStatus,
  VideoResponse,
  VideoSummaryResponse,
} from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Route =
  | { name: 'posts' }
  | { name: 'post-detail'; postId: string }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'new-post' }
  | { name: 'admin-comments' }
  | { name: 'not-found' };

type Navigate = (path: string) => void;
type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

type PostsQueryState = {
  page: number;
  limit: number;
  q: string;
  tag: string;
};

type AsyncState<TData> =
  | { status: 'idle' | 'loading'; data: TData | null; error: null }
  | { status: 'success'; data: TData; error: null }
  | { status: 'error'; data: TData | null; error: string };

const POSTS_LIMIT = 20;

function parseRoute(pathname: string): Route {
  if (pathname === '/') return { name: 'posts' };
  if (pathname === '/login') return { name: 'login' };
  if (pathname === '/signup') return { name: 'signup' };
  if (pathname === '/posts/new') return { name: 'new-post' };
  if (pathname === '/admin/comments') return { name: 'admin-comments' };

  const postMatch = pathname.match(/^\/posts\/([^/]+)$/);
  if (postMatch) return { name: 'post-detail', postId: postMatch[1] };

  return { name: 'not-found' };
}

function getCurrentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function getSearchFromPath(path: string) {
  const queryStart = path.indexOf('?');
  return queryStart >= 0 ? path.slice(queryStart) : '';
}

function getPathnameFromPath(path: string) {
  return path.split('?')[0] || '/';
}

function useRoute() {
  const [path, setPath] = useState(getCurrentPath);

  useEffect(() => {
    const handlePopState = () => setPath(getCurrentPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath: string) => {
    if (getCurrentPath() === nextPath) return;
    window.history.pushState(null, '', nextPath);
    setPath(getCurrentPath());
    window.scrollTo({ top: 0 });
  };

  return {
    locationSearch: getSearchFromPath(path),
    route: parseRoute(getPathnameFromPath(path)),
    navigate,
  };
}

export default function App() {
  const { route, navigate, locationSearch } = useRoute();

  return (
    <div className="min-h-svh bg-background text-foreground">
      <TopNav navigate={navigate} route={route} />
      <main className="mx-auto grid w-[min(1240px,calc(100%-28px))] grid-cols-1 gap-6 py-6 lg:w-[min(1240px,calc(100%-48px))] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:py-8">
        {renderRoute(route, navigate, locationSearch)}
      </main>
    </div>
  );
}

function renderRoute(route: Route, navigate: Navigate, locationSearch: string) {
  switch (route.name) {
    case 'posts':
      return <PostsIndex locationSearch={locationSearch} navigate={navigate} />;
    case 'post-detail':
      return <PostDetail navigate={navigate} postId={route.postId} />;
    case 'login':
      return <AuthScreen mode="login" navigate={navigate} />;
    case 'signup':
      return <AuthScreen mode="signup" navigate={navigate} />;
    case 'new-post':
      return <PostEditorPlaceholder navigate={navigate} />;
    case 'admin-comments':
      return <AdminCommentsPlaceholder />;
    case 'not-found':
      return <NotFound navigate={navigate} />;
  }
}

function TopNav({ navigate, route }: { navigate: Navigate; route: Route }) {
  const isActive = (target: Route['name']) => route.name === target;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-[1296px] flex-wrap items-center gap-3 px-4 py-3 md:flex-nowrap md:px-7 md:py-0">
        <button
          className="flex min-w-fit cursor-pointer items-center gap-2 text-left font-semibold"
          onClick={() => navigate('/?page=1&limit=20')}
          type="button"
        >
          <span className="grid size-8 place-items-center rounded-md bg-foreground text-sm text-background">
            A
          </span>
          <span>Arena</span>
        </button>

        <label className="order-3 flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground md:order-none md:ml-3 md:max-w-xl md:flex-1">
          <Search className="size-4" aria-hidden="true" />
          <span className="sr-only">검색</span>
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search discussions, tags, video context"
            readOnly
          />
        </label>

        <nav className="ml-auto flex items-center gap-2" aria-label="Primary">
          <Button
            className={cn(isActive('login') && 'bg-accent')}
            onClick={() => navigate('/login')}
            variant="outline"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Login
          </Button>
          <Button onClick={() => navigate('/posts/new')}>
            <Plus className="size-4" aria-hidden="true" />
            New post
          </Button>
        </nav>
      </div>
    </header>
  );
}

function PostsIndex({ locationSearch, navigate }: { locationSearch: string; navigate: Navigate }) {
  const query = useMemo(() => parsePostsQuery(locationSearch), [locationSearch]);
  const [searchValue, setSearchValue] = useState(query.q);
  const [postsState, setPostsState] = useState<AsyncState<PaginatedResponse<PostListItemResponse>>>(
    {
      status: 'idle',
      data: null,
      error: null,
    },
  );
  const [tagsState, setTagsState] = useState<AsyncState<TagResponse[]>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [postsReloadKey, setPostsReloadKey] = useState(0);
  const [tagsReloadKey, setTagsReloadKey] = useState(0);

  useEffect(() => {
    setSearchValue(query.q);
  }, [query.q]);

  useEffect(() => {
    let ignore = false;

    setPostsState((current) => ({ status: 'loading', data: current.data, error: null }));

    listPosts({
      page: query.page,
      limit: query.limit,
      q: query.q || undefined,
      tag: query.tag || undefined,
    })
      .then((data) => {
        if (!ignore) {
          setPostsState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setPostsState((current) => ({
            status: 'error',
            data: current.data,
            error: formatApiError(error),
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, [postsReloadKey, query.limit, query.page, query.q, query.tag]);

  useEffect(() => {
    let ignore = false;

    setTagsState((current) => ({ status: 'loading', data: current.data, error: null }));

    listTags()
      .then((data) => {
        if (!ignore) {
          setTagsState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setTagsState((current) => ({
            status: 'error',
            data: current.data,
            error: formatApiError(error),
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, [tagsReloadKey]);

  const posts = postsState.data?.items ?? [];
  const meta = postsState.data?.meta ?? createEmptyMeta(query);
  const hasActiveFilters = query.q.length > 0 || query.tag.length > 0;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(buildPostsPath(query, { page: 1, q: searchValue.trim() }));
  };

  const handleSelectTag = (tag: string) => {
    navigate(buildPostsPath(query, { page: 1, tag }));
  };

  const handleClearFilters = () => {
    setSearchValue('');
    navigate(buildPostsPath(query, { page: 1, q: '', tag: '' }));
  };

  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="Post list">
        <PageHeading
          eyebrow="Discussion board"
          title="게시글 목록"
          description="최신 토론, 태그, 영상 처리 상태를 먼저 확인합니다."
          badge={<Badge variant="info">Harness 3</Badge>}
        />

        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
          <label className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">게시글 검색어</span>
            <Input
              className="pl-9"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="제목이나 본문에서 검색"
              value={searchValue}
            />
          </label>
          <div className="flex gap-2">
            <Button className="shrink-0" type="submit" variant="outline">
              검색
            </Button>
            {hasActiveFilters && (
              <Button className="shrink-0" onClick={handleClearFilters} variant="ghost">
                초기화
              </Button>
            )}
          </div>
        </form>

        <TagFilters
          activeTag={query.tag}
          onRetry={() => setTagsReloadKey((key) => key + 1)}
          onSelectTag={handleSelectTag}
          state={tagsState}
        />

        <PostsList
          navigate={navigate}
          onRetry={() => setPostsReloadKey((key) => key + 1)}
          posts={posts}
          query={query}
          state={postsState}
        />

        {postsState.status === 'success' && posts.length > 0 && (
          <PaginationControls
            meta={meta}
            onNext={() => navigate(buildPostsPath(query, { page: query.page + 1 }))}
            onPrevious={() =>
              navigate(buildPostsPath(query, { page: Math.max(1, query.page - 1) }))
            }
          />
        )}
      </section>

      <BoardSidePanel
        hasActiveFilters={hasActiveFilters}
        meta={meta}
        query={query}
        state={postsState}
        tagCount={tagsState.data?.length ?? 0}
      />
    </>
  );
}

function TagFilters({
  activeTag,
  onRetry,
  onSelectTag,
  state,
}: {
  activeTag: string;
  onRetry: () => void;
  onSelectTag: (tag: string) => void;
  state: AsyncState<TagResponse[]>;
}) {
  const tags = state.data ?? [];

  return (
    <section className="grid gap-2" aria-label="Tag filters">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onSelectTag('')}
          size="sm"
          variant={activeTag === '' ? 'default' : 'outline'}
        >
          전체
        </Button>
        {state.status === 'loading' && tags.length === 0
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton className="h-8 w-16 rounded-md" key={index} />
            ))
          : tags.map((tag) => (
              <Button
                key={tag.id}
                onClick={() => onSelectTag(tag.name)}
                size="sm"
                variant={activeTag === tag.name ? 'default' : 'outline'}
              >
                {tag.name}
              </Button>
            ))}
      </div>
      {state.status === 'error' && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>태그를 불러오지 못했습니다. {state.error}</span>
          <Button className="w-fit" onClick={onRetry} size="sm" variant="destructive">
            <RefreshCw className="size-4" aria-hidden="true" />
            재시도
          </Button>
        </div>
      )}
    </section>
  );
}

function PostsList({
  navigate,
  onRetry,
  posts,
  query,
  state,
}: {
  navigate: Navigate;
  onRetry: () => void;
  posts: PostListItemResponse[];
  query: PostsQueryState;
  state: AsyncState<PaginatedResponse<PostListItemResponse>>;
}) {
  if (state.status === 'loading' && posts.length === 0) {
    return <PostsLoading />;
  }

  if (state.status === 'error') {
    return <PostsError error={state.error} onRetry={onRetry} />;
  }

  if (state.status === 'success' && posts.length === 0) {
    return <PostsEmpty query={query} />;
  }

  return (
    <div className="grid gap-3" aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && (
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          목록을 새로 불러오는 중입니다.
        </div>
      )}
      {posts.map((post) => (
        <PostListItem key={post.id} navigate={navigate} post={post} />
      ))}
    </div>
  );
}

function PostsLoading() {
  return (
    <div className="grid gap-3" aria-label="게시글 목록 로딩 중">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5" key={index}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid flex-1 gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function PostsError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section
      className="grid gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
      aria-label="게시글 목록 오류"
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-destructive">게시글을 불러오지 못했습니다</h2>
        <p className="mt-2 text-sm leading-6 text-destructive/80">{error}</p>
      </div>
      <Button className="w-fit" onClick={onRetry} variant="destructive">
        <RefreshCw className="size-4" aria-hidden="true" />
        재시도
      </Button>
    </section>
  );
}

function PostsEmpty({ query }: { query: PostsQueryState }) {
  const hasFilter = query.q.length > 0 || query.tag.length > 0;

  return (
    <section
      className="rounded-lg border border-border bg-muted p-5 text-sm leading-6 text-muted-foreground"
      aria-label="게시글 목록 비어 있음"
    >
      <h2 className="text-base font-semibold text-foreground">아직 항목이 없음</h2>
      <p className="mt-2">
        {hasFilter
          ? '현재 검색 조건에 맞는 게시글이 없습니다.'
          : '아직 등록된 토론 게시글이 없습니다.'}
      </p>
    </section>
  );
}

function PostListItem({ navigate, post }: { navigate: Navigate; post: PostListItemResponse }) {
  const videoSummary = getVideoProcessingSummary(post.video);

  return (
    <article>
      <button
        className="grid w-full cursor-pointer gap-4 rounded-lg border border-border bg-card p-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
        onClick={() => navigate(`/posts/${post.id}`)}
        type="button"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug sm:text-[17px]">{post.title}</h2>
            <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-neutral-600">
              {post.contentPreview || '본문 미리보기가 없습니다.'}
            </p>
          </div>
          <Badge className="w-fit shrink-0" variant={videoSummary.variant}>
            {videoSummary.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="font-medium text-neutral-700">{post.author.nickname}</span>
          <span>{formatDateTime(post.createdAt)}</span>
          <Metric icon={MessageCircle} label={`댓글 ${post.commentCount}`} />
          <Metric icon={Eye} label={`조회 ${post.viewCount}`} />
          <Metric icon={Heart} label={`좋아요 ${post.likeCount}`} />
          {post.tags.length > 0 && <span>{post.tags.map((tag) => `#${tag.name}`).join(' ')}</span>}
        </div>
      </button>
    </article>
  );
}

function PaginationControls({
  meta,
  onNext,
  onPrevious,
}: {
  meta: PaginationMeta;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const canGoPrevious = meta.page > 1;
  const canGoNext = meta.page < meta.totalPages;

  return (
    <nav
      className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <span>
        총 {meta.total.toLocaleString()}개 · {meta.page}/{Math.max(meta.totalPages, 1)} 페이지
      </span>
      <div className="flex gap-2">
        <Button disabled={!canGoPrevious} onClick={onPrevious} variant="outline">
          이전
        </Button>
        <Button disabled={!canGoNext} onClick={onNext} variant="outline">
          다음
        </Button>
      </div>
    </nav>
  );
}

function PostDetail({ navigate, postId }: { navigate: Navigate; postId: string }) {
  const viewedPostIdRef = useRef<string | null>(null);
  const [postState, setPostState] = useState<AsyncState<PostResponse>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [commentsState, setCommentsState] = useState<AsyncState<CommentResponse[]>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [videoState, setVideoState] = useState<AsyncState<VideoResponse>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [postNotFound, setPostNotFound] = useState(false);
  const [postReloadKey, setPostReloadKey] = useState(0);
  const [commentsReloadKey, setCommentsReloadKey] = useState(0);
  const [videoReloadKey, setVideoReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    setPostNotFound(false);
    setPostState((current) => ({
      status: 'loading',
      data: current.data?.id === postId ? current.data : null,
      error: null,
    }));

    getPost(postId)
      .then((data) => {
        if (!ignore) {
          setPostState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setPostNotFound(isNotFoundError(error));
          setPostState({ status: 'error', data: null, error: formatApiError(error) });
        }
      });

    return () => {
      ignore = true;
    };
  }, [postId, postReloadKey]);

  useEffect(() => {
    let ignore = false;

    setCommentsState(() => ({
      status: 'loading',
      data: null,
      error: null,
    }));

    listComments(postId)
      .then((data) => {
        if (!ignore) {
          setCommentsState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setCommentsState((current) => ({
            status: 'error',
            data: current.data,
            error: formatApiError(error),
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, [commentsReloadKey, postId]);

  const post = postState.data;
  const videoId = post?.video.id ?? null;

  useEffect(() => {
    if (!videoId) {
      setVideoState({ status: 'idle', data: null, error: null });
      return;
    }

    let ignore = false;

    setVideoState((current) => ({
      status: 'loading',
      data: current.data?.id === videoId ? current.data : null,
      error: null,
    }));

    getVideo(videoId)
      .then((data) => {
        if (!ignore) {
          setVideoState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setVideoState((current) => ({
            status: 'error',
            data: current.data,
            error: formatApiError(error),
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, [videoId, videoReloadKey]);

  useEffect(() => {
    if (postState.status !== 'success') return;
    if (viewedPostIdRef.current === postState.data.id) return;

    viewedPostIdRef.current = postState.data.id;

    incrementPostView(postState.data.id)
      .then((result) => {
        setPostState((current) => {
          if (current.status !== 'success' || current.data.id !== postState.data.id) {
            return current;
          }

          return {
            status: 'success',
            data: {
              ...current.data,
              viewCount: result.viewCount,
            },
            error: null,
          };
        });
      })
      .catch(() => {
        // View counting is best-effort and should not block the read-only detail page.
      });
  }, [postState]);

  if (postNotFound) {
    return <PostDetailNotFound navigate={navigate} />;
  }

  if (postState.status === 'loading' && !post) {
    return <PostDetailLoading navigate={navigate} />;
  }

  if (postState.status === 'error' && !post) {
    return (
      <PostDetailError
        error={postState.error}
        navigate={navigate}
        onRetry={() => setPostReloadKey((key) => key + 1)}
      />
    );
  }

  if (!post) {
    return <PostDetailLoading navigate={navigate} />;
  }

  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="Post detail">
        <Button
          className="w-fit"
          onClick={() => navigate('/?page=1&limit=20')}
          variant="ghost"
          size="sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          목록
        </Button>

        <PostDetailHeader post={post} />

        <PostVideoSection
          fallbackVideo={post.video}
          onRetry={() => setVideoReloadKey((key) => key + 1)}
          state={videoState}
        />

        <PostBody post={post} />

        <CommentsSection
          onRetry={() => setCommentsReloadKey((key) => key + 1)}
          state={commentsState}
        />
      </section>

      <DetailSidePanel comments={commentsState.data ?? []} post={post} videoState={videoState} />
    </>
  );
}

function PostDetailLoading({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="Post detail loading">
        <Button
          className="w-fit"
          onClick={() => navigate('/?page=1&limit=20')}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          목록
        </Button>
        <div className="grid gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="aspect-video rounded-lg" />
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <CommentsLoading />
      </section>
      <aside className="grid h-fit gap-5" aria-label="Detail side loading">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </aside>
    </>
  );
}

function PostDetailError({
  error,
  navigate,
  onRetry,
}: {
  error: string;
  navigate: Navigate;
  onRetry: () => void;
}) {
  return (
    <>
      <section
        className="grid gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-5"
        aria-label="Post detail error"
      >
        <PageHeading
          badge={<Badge variant="destructive">error</Badge>}
          description={error}
          eyebrow="Post detail"
          title="게시글 상세를 불러오지 못했습니다"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry} variant="destructive">
            <RefreshCw className="size-4" aria-hidden="true" />
            재시도
          </Button>
          <Button onClick={() => navigate('/?page=1&limit=20')} variant="outline">
            게시글 목록
          </Button>
        </div>
      </section>
      <PlaceholderSide title="읽기 오류" items={['GET /posts/:postId', '서버 연결 상태 확인']} />
    </>
  );
}

function PostDetailNotFound({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-4" aria-label="Post not found">
        <PageHeading
          badge={<Badge variant="destructive">404</Badge>}
          description="삭제되었거나 존재하지 않는 게시글입니다."
          eyebrow="Post detail"
          title="게시글을 찾을 수 없습니다"
        />
        <Button className="w-fit" onClick={() => navigate('/?page=1&limit=20')}>
          게시글 목록으로 이동
        </Button>
      </section>
      <PlaceholderSide title="Not found" items={['삭제된 게시글', '존재하지 않는 postId']} />
    </>
  );
}

function PostDetailHeader({ post }: { post: PostResponse }) {
  const videoSummary = getVideoProcessingSummary(post.video);

  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Post detail</p>
          <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{post.title}</h1>
        </div>
        <Badge className="w-fit shrink-0" variant={videoSummary.variant}>
          {videoSummary.label}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <span className="font-medium text-neutral-700">{post.author.nickname}</span>
        <span>{formatDateTime(post.createdAt)}</span>
        <Metric icon={MessageCircle} label={`댓글 ${post.commentCount}`} />
        <Metric icon={Eye} label={`조회 ${post.viewCount}`} />
        <Metric icon={Heart} label={`좋아요 ${post.likeCount}`} />
      </div>

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag.id} variant="muted">
              #{tag.name}
            </Badge>
          ))}
        </div>
      )}
    </header>
  );
}

function PostVideoSection({
  fallbackVideo,
  onRetry,
  state,
}: {
  fallbackVideo: VideoSummaryResponse;
  onRetry: () => void;
  state: AsyncState<VideoResponse>;
}) {
  const video = state.data;
  const videoForStatus = video ?? fallbackVideo;
  const summary = getVideoProcessingSummary(videoForStatus);

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
      aria-label="Video detail"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">영상 정보</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            영상 메타데이터와 처리 상태를 읽기 전용으로 표시합니다.
          </p>
        </div>
        <Badge className="w-fit shrink-0" variant={summary.variant}>
          {summary.label}
        </Badge>
      </div>

      {state.status === 'error' && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>영상 상세 정보를 불러오지 못했습니다. {state.error}</span>
          <Button className="w-fit" onClick={onRetry} size="sm" variant="destructive">
            <RefreshCw className="size-4" aria-hidden="true" />
            재시도
          </Button>
        </div>
      )}

      <VideoFrame video={video} />

      <div className="grid gap-3 sm:grid-cols-3">
        <VideoStatusItem label="Metadata" status={videoForStatus.metadataStatus} />
        <VideoStatusItem label="Transcript" status={videoForStatus.transcriptStatus} />
        <VideoStatusItem label="Embedding" status={videoForStatus.embeddingStatus} />
      </div>

      {state.status === 'loading' && !video ? (
        <div className="grid gap-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <VideoMetadata video={video} />
      )}
    </section>
  );
}

function VideoFrame({ video }: { video: VideoResponse | null }) {
  const thumbnailUrl = video?.thumbnailUrl;
  const title = video?.title ?? 'YouTube video';

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-neutral-950">
      <div className="relative aspect-video">
        {thumbnailUrl ? (
          <img
            alt={title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            src={thumbnailUrl}
          />
        ) : (
          <div className="grid h-full place-items-center bg-[linear-gradient(135deg,rgba(23,23,23,1),rgba(64,64,64,1))] text-white">
            <span className="grid size-16 place-items-center rounded-full border border-white/30 bg-white/10">
              <Play className="ml-1 size-7 fill-white" aria-hidden="true" />
            </span>
          </div>
        )}
      </div>
      {video?.youtubeUrl && (
        <a
          className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={video.youtubeUrl}
          rel="noreferrer"
          target="_blank"
        >
          <span className="min-w-0 truncate">{video.title ?? video.youtubeVideoId}</span>
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function VideoMetadata({ video }: { video: VideoResponse | null }) {
  if (!video) {
    return (
      <p className="rounded-md bg-muted p-3 text-sm leading-6 text-muted-foreground">
        영상 상세 메타데이터를 기다리는 중입니다.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{video.title ?? '제목 수집 대기 중'}</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {video.description || '영상 설명을 아직 사용할 수 없습니다.'}
        </p>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <DetailMetaLine label="채널" value={video.channelName ?? '수집 대기'} />
        <DetailMetaLine
          label="게시일"
          value={video.publishedAt ? formatDateTime(video.publishedAt) : '수집 대기'}
        />
        <DetailMetaLine label="YouTube 조회" value={formatNullableNumber(video.youtubeViewCount)} />
        <DetailMetaLine
          label="YouTube 댓글"
          value={formatNullableNumber(video.youtubeCommentCount)}
        />
      </div>
    </div>
  );
}

function VideoStatusItem({ label, status }: { label: string; status: VideoProcessingStatus }) {
  const statusLabel = getVideoProcessingStatusLabel(status);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-neutral-50 px-3 py-2 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
    </div>
  );
}

function PostBody({ post }: { post: PostResponse }) {
  return (
    <article className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">토론 본문</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            작성자가 영상과 함께 남긴 맥락입니다.
          </p>
        </div>
        <Badge variant="outline">read-only</Badge>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-neutral-800">
        {post.content}
      </p>
    </article>
  );
}

function CommentsSection({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: AsyncState<CommentResponse[]>;
}) {
  const comments = state.data ?? [];
  const totalCommentCount = countComments(comments);

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
      aria-label="Comments"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">댓글 thread</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            루트 댓글과 대댓글을 최대 2단계로 표시합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="muted">{totalCommentCount.toLocaleString()}개</Badge>
          <Button disabled size="sm" variant="outline">
            댓글 작성
          </Button>
        </div>
      </div>

      {state.status === 'loading' && comments.length === 0 && <CommentsLoading />}

      {state.status === 'error' && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>댓글을 불러오지 못했습니다. {state.error}</span>
          <Button className="w-fit" onClick={onRetry} size="sm" variant="destructive">
            <RefreshCw className="size-4" aria-hidden="true" />
            재시도
          </Button>
        </div>
      )}

      {state.status === 'success' && comments.length === 0 && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
          <h3 className="font-semibold text-foreground">아직 항목이 없음</h3>
          <p className="mt-1">이 게시글에는 아직 댓글이 없습니다.</p>
        </div>
      )}

      {comments.length > 0 && (
        <div className="grid gap-3" aria-busy={state.status === 'loading'}>
          {state.status === 'loading' && (
            <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              댓글을 새로 불러오는 중입니다.
            </div>
          )}
          {comments.map((comment) => (
            <CommentThread comment={comment} key={comment.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommentsLoading() {
  return (
    <div className="grid gap-3" aria-label="댓글 로딩 중">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4" key={index}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function CommentThread({ comment }: { comment: CommentResponse }) {
  const replies = comment.replies ?? [];

  return (
    <div className="grid gap-3">
      <CommentItem comment={comment} level={0} />
      {replies.map((reply) => (
        <CommentItem comment={reply} key={reply.id} level={1} />
      ))}
    </div>
  );
}

function CommentItem({ comment, level }: { comment: CommentResponse; level: 0 | 1 }) {
  const isReply = level === 1;
  const isDeleted = comment.isDeleted || comment.moderationStatus === 'DELETED_BY_ADMIN';
  const moderationBadge = getModerationStatusLabel(comment.moderationStatus);

  return (
    <article
      className={cn(
        'grid gap-3 rounded-lg border border-border p-4',
        isReply ? 'ml-0 bg-neutral-50 sm:ml-7' : 'bg-card',
        isDeleted && 'border-dashed bg-muted/60',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
            {getAuthorInitial(comment.author.nickname)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{comment.author.nickname}</h3>
            <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isReply && <Badge variant="muted">reply</Badge>}
          {moderationBadge && (
            <Badge className="w-fit" variant={moderationBadge.variant}>
              {moderationBadge.label}
            </Badge>
          )}
        </div>
      </div>

      <p
        className={cn(
          'whitespace-pre-wrap break-words text-sm leading-6',
          isDeleted ? 'text-muted-foreground' : 'text-neutral-800',
        )}
      >
        {comment.content}
      </p>

      <CommentAnalysisBadges comment={comment} />

      {!isDeleted && (
        <div className="flex flex-wrap gap-2">
          {comment.analysis?.evidenceCount ? (
            <Button disabled size="sm" variant="outline">
              근거 후보 보기
            </Button>
          ) : null}
          {!isReply && (
            <Button disabled size="sm" variant="outline">
              답글
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function CommentAnalysisBadges({ comment }: { comment: CommentResponse }) {
  const analysis = comment.analysis;

  if (!analysis) {
    return (
      <div className="flex flex-wrap gap-2">
        <Badge variant="muted">분석 없음</Badge>
      </div>
    );
  }

  const commentType = getCommentTypeLabel(analysis.commentType);
  const aiStatus = getAiAnalysisStatusLabel(analysis.aiAnalysisStatus);
  const ragStatus = getRagStatusLabel(analysis.ragStatus);

  return (
    <div className="flex flex-wrap gap-2">
      {commentType && <Badge variant={commentType.variant}>{commentType.label}</Badge>}
      <Badge variant={aiStatus.variant}>{aiStatus.label}</Badge>
      <Badge variant={ragStatus.variant}>{ragStatus.label}</Badge>
      {analysis.evidenceCount > 0 && (
        <Badge variant="success">근거 후보 {analysis.evidenceCount}</Badge>
      )}
    </div>
  );
}

function AuthScreen({ mode, navigate }: { mode: 'login' | 'signup'; navigate: Navigate }) {
  const isLogin = mode === 'login';

  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label={isLogin ? 'Login' : 'Signup'}>
        <PageHeading
          eyebrow={isLogin ? 'Auth placeholder' : 'Account placeholder'}
          title={isLogin ? '로그인' : '회원가입'}
          description="세션과 CSRF 흐름은 Harness 5에서 실제 API와 연결합니다."
          badge={<Badge variant="muted">placeholder</Badge>}
        />

        <form className="grid max-w-xl gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
          {!isLogin && (
            <label className="grid gap-2 text-sm font-medium">
              Nickname
              <Input placeholder="arena-user" readOnly />
            </label>
          )}
          <label className="grid gap-2 text-sm font-medium">
            Email
            <Input placeholder="you@example.com" readOnly />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Password
            <Input placeholder="••••••••" readOnly type="password" />
          </label>
          <Button disabled>
            {isLogin ? (
              <LogIn className="size-4" aria-hidden="true" />
            ) : (
              <UserPlus className="size-4" aria-hidden="true" />
            )}
            {isLogin ? '로그인 연결 대기' : '회원가입 연결 대기'}
          </Button>
        </form>

        <Button
          className="w-fit"
          onClick={() => navigate(isLogin ? '/signup' : '/login')}
          variant="ghost"
        >
          {isLogin ? '회원가입 화면 보기' : '로그인 화면 보기'}
        </Button>
      </section>

      <PlaceholderSide
        title="Auth scope"
        items={['access token memory state', 'refresh 또는 me 조회', 'logout', 'csrf helper']}
      />
    </>
  );
}

function PostEditorPlaceholder({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="New post placeholder">
        <PageHeading
          eyebrow="Write placeholder"
          title="게시글 작성"
          description="YouTube URL 기반 작성 흐름은 Harness 6에서 연결합니다."
          badge={<Badge variant="muted">API 미연결</Badge>}
        />

        <form className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
          <label className="grid gap-2 text-sm font-medium">
            Title
            <Input placeholder="영상 속 주장에 대해 토론해봅시다" readOnly />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            YouTube URL
            <Input placeholder="https://www.youtube.com/watch?v=..." readOnly />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Content
            <Textarea placeholder="토론할 맥락을 적습니다." readOnly />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled>
              <FileText className="size-4" aria-hidden="true" />
              작성 연결 대기
            </Button>
            <Button onClick={() => navigate('/?page=1&limit=20')} variant="outline">
              취소
            </Button>
          </div>
        </form>
      </section>

      <PlaceholderSide
        title="Write scope"
        items={['post create/update/delete', 'comment write', 'reply write', 'like toggle']}
      />
    </>
  );
}

function AdminCommentsPlaceholder() {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="Admin comments">
        <PageHeading
          eyebrow="Admin placeholder"
          title="관리자 댓글 검토"
          description="운영형 dense list 구조만 먼저 고정합니다."
          badge={<Badge variant="warning">NEEDS_REVIEW</Badge>}
        />

        <div className="flex flex-wrap gap-2">
          <Button size="sm">검토 필요</Button>
          <Button variant="outline" size="sm">
            정상
          </Button>
          <Button variant="outline" size="sm">
            관리자 삭제
          </Button>
        </div>

        <section className="grid gap-2" aria-label="Admin queue">
          {['검토가 필요한 댓글', '분석 재시도가 필요한 댓글'].map((title, index) => (
            <article
              className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={title}
            >
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  commentType {index === 0 ? 'TOXIC' : 'FACT_CLAIM'} · aiAnalysis{' '}
                  {index === 0 ? 'SUCCESS' : 'FAILED'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled>
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Retry
                </Button>
                <Button variant="destructive" size="sm" disabled>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </section>
      </section>

      <PlaceholderSide
        title="Admin scope"
        items={['GET /admin/comments', 'moderation filter', 'delete action', 'analysis retry']}
      />
    </>
  );
}

function BoardSidePanel({
  hasActiveFilters,
  meta,
  query,
  state,
  tagCount,
}: {
  hasActiveFilters: boolean;
  meta: PaginationMeta;
  query: PostsQueryState;
  state: AsyncState<PaginatedResponse<PostListItemResponse>>;
  tagCount: number;
}) {
  const statusLabel = getListStatusLabel(state, meta);

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Board side panel">
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">목록 상태</h2>
          <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
        </div>
        <StatusLine label="총 게시글" badge={meta.total.toLocaleString()} tone="secondary" />
        <StatusLine
          label="현재 페이지"
          badge={`${meta.page}/${Math.max(meta.totalPages, 1)}`}
          tone="secondary"
        />
        <StatusLine label="태그 필터" badge={`${tagCount.toLocaleString()}개`} tone="secondary" />
      </section>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">검색 조건</h2>
          <Badge variant={hasActiveFilters ? 'info' : 'muted'}>
            {hasActiveFilters ? '적용됨' : '전체'}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          검색어: {query.q || '없음'}
          <br />
          태그: {query.tag || '전체'}
          <br />
          페이지당 {query.limit}개
        </p>
      </section>
    </aside>
  );
}

function DetailSidePanel({
  comments,
  post,
  videoState,
}: {
  comments: CommentResponse[];
  post: PostResponse;
  videoState: AsyncState<VideoResponse>;
}) {
  const video = videoState.data ?? post.video;
  const videoSummary = getVideoProcessingSummary(video);
  const totalCommentCount = countComments(comments);

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Detail side panel">
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">처리 상태</h2>
          <Badge variant={videoSummary.variant}>{videoSummary.label}</Badge>
        </div>
        {videoState.status === 'error' && (
          <p className="rounded-md bg-destructive/5 p-3 text-sm leading-6 text-destructive">
            영상 상세 조회에 실패해 게시글의 요약 상태를 표시합니다.
          </p>
        )}
        <DetailStatusRow label="Metadata" status={video.metadataStatus} />
        <DetailStatusRow label="Transcript" status={video.transcriptStatus} />
        <DetailStatusRow label="Embedding" status={video.embeddingStatus} />
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Agent 질문</h2>
          <Badge variant="info">placeholder</Badge>
        </div>
        <Textarea readOnly value="이 게시글의 핵심 주장과 관련된 자막 근거 후보를 찾아줘." />
        <Button disabled>
          <Send className="size-4" aria-hidden="true" />
          질문 보내기
        </Button>
        <div className="rounded-md bg-muted p-3 text-sm leading-6 text-neutral-600">
          Agent 답변에는 근거 후보와 한계를 함께 표시합니다.
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">요약과 근거 후보</h2>
          <Badge variant="muted">placeholder</Badge>
        </div>
        <StatusLine badge={totalCommentCount.toLocaleString()} label="현재 댓글" tone="secondary" />
        <StatusLine
          badge={post.commentCount.toLocaleString()}
          label="게시글 카운터"
          tone="secondary"
        />
        <Button disabled variant="outline">
          댓글 스레드 요약
        </Button>
        <Button disabled variant="outline">
          근거 후보 sheet
        </Button>
        <p className="text-sm leading-6 text-muted-foreground">
          근거 후보는 관련 있을 수 있는 자막 구간이며, 사실 여부를 최종 판정하지 않습니다.
        </p>
      </section>
    </aside>
  );
}

function PlaceholderSide({ title, items }: { title: string; items: string[] }) {
  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label={title}>
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Badge variant="muted">future</Badge>
        </div>
        <ul className="grid gap-3 text-sm text-muted-foreground">
          {items.map((item) => (
            <li className="flex items-center gap-2" key={item}>
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function StatusLine({
  label,
  badge,
  tone,
}: {
  label: string;
  badge: string;
  tone: 'success' | 'warning' | 'secondary';
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <Badge variant={tone}>{badge}</Badge>
      </div>
      <Separator />
    </>
  );
}

function DetailMetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-neutral-800">{value}</span>
    </div>
  );
}

function DetailStatusRow({ label, status }: { label: string; status: VideoProcessingStatus }) {
  const statusLabel = getVideoProcessingStatusLabel(status);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
      </div>
      {badge}
    </header>
  );
}

function Metric({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function NotFound({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-4">
        <PageHeading
          eyebrow="Not found"
          title="삭제되었거나 존재하지 않음"
          description="요청한 화면을 찾을 수 없습니다."
          badge={<Badge variant="destructive">404</Badge>}
        />
        <Button className="w-fit" onClick={() => navigate('/?page=1&limit=20')}>
          게시글 목록으로 이동
        </Button>
      </section>
      <PlaceholderSide
        title="Available routes"
        items={['/', '/posts/:postId', '/login', '/signup', '/posts/new', '/admin/comments']}
      />
    </>
  );
}

function parsePostsQuery(search: string): PostsQueryState {
  const params = new URLSearchParams(search);

  return {
    page: parsePositiveInteger(params.get('page'), 1),
    limit: POSTS_LIMIT,
    q: (params.get('q') ?? '').trim(),
    tag: (params.get('tag') ?? '').trim(),
  };
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPostsPath(current: PostsQueryState, next: Partial<PostsQueryState>) {
  const merged = {
    ...current,
    ...next,
    limit: POSTS_LIMIT,
  };
  const params = new URLSearchParams();

  params.set('page', String(Math.max(1, merged.page)));
  params.set('limit', String(POSTS_LIMIT));

  if (merged.q.trim()) {
    params.set('q', merged.q.trim());
  }

  if (merged.tag.trim()) {
    params.set('tag', merged.tag.trim());
  }

  return `/?${params.toString()}`;
}

function createEmptyMeta(query: PostsQueryState): PaginationMeta {
  return {
    page: query.page,
    limit: query.limit,
    total: 0,
    totalPages: 0,
  };
}

function formatApiError(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '요청을 처리하지 못했습니다.';
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const hasDifferentYear = date.getFullYear() !== now.getFullYear();

  return new Intl.DateTimeFormat('ko-KR', {
    year: hasDifferentYear ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatNullableNumber(value: number | null) {
  return value === null ? '수집 대기' : value.toLocaleString();
}

function countComments(comments: CommentResponse[]) {
  return comments.reduce((total, comment) => total + 1 + (comment.replies?.length ?? 0), 0);
}

function getAuthorInitial(nickname: string) {
  const trimmed = nickname.trim();
  return trimmed.length > 0 ? trimmed[0] : '?';
}

function isNotFoundError(error: unknown) {
  return error instanceof ApiRequestError && error.status === 404;
}

function getVideoProcessingStatusLabel(status: VideoProcessingStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: '대기 중', variant: 'secondary' };
    case 'PROCESSING':
      return { label: '처리 중', variant: 'secondary' };
    case 'SUCCESS':
      return { label: '준비됨', variant: 'success' };
    case 'FAILED':
      return { label: '실패', variant: 'destructive' };
    case 'NOT_AVAILABLE':
      return { label: '사용할 수 없음', variant: 'muted' };
  }
}

function getCommentTypeLabel(type: CommentType | null): {
  label: string;
  variant: BadgeVariant;
} | null {
  switch (type) {
    case 'FACT_CLAIM':
      return { label: '사실 주장', variant: 'info' };
    case 'OPINION':
      return { label: '의견', variant: 'outline' };
    case 'QUESTION':
      return { label: '질문', variant: 'secondary' };
    case 'TOXIC':
      return { label: '검토 필요', variant: 'warning' };
    case null:
      return null;
  }
}

function getAiAnalysisStatusLabel(status: AiAnalysisStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: '분석 대기', variant: 'secondary' };
    case 'PROCESSING':
      return { label: '분석 중', variant: 'secondary' };
    case 'SUCCESS':
      return { label: '분석됨', variant: 'outline' };
    case 'FAILED':
      return { label: '분석 실패', variant: 'destructive' };
    case 'NOT_REQUIRED':
      return { label: '분석 없음', variant: 'muted' };
  }
}

function getRagStatusLabel(status: RagStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: '근거 후보 준비 중', variant: 'secondary' };
    case 'PROCESSING':
      return { label: '자막 검색 중', variant: 'secondary' };
    case 'SUCCESS':
      return { label: '근거 후보 있음', variant: 'success' };
    case 'NO_RESULT':
      return { label: '관련 구간 없음', variant: 'muted' };
    case 'FAILED':
      return { label: '근거 후보 실패', variant: 'destructive' };
    case 'NOT_REQUIRED':
      return { label: '근거 후보 없음', variant: 'muted' };
  }
}

function getModerationStatusLabel(status: ModerationStatus): {
  label: string;
  variant: BadgeVariant;
} | null {
  switch (status) {
    case 'NORMAL':
      return null;
    case 'NEEDS_REVIEW':
      return { label: '검토 필요', variant: 'warning' };
    case 'DELETED_BY_ADMIN':
      return { label: '관리자 삭제', variant: 'destructive' };
  }
}

function getVideoProcessingSummary(video: VideoSummaryResponse): {
  label: string;
  variant: BadgeVariant;
} {
  const statuses = [video.metadataStatus, video.transcriptStatus, video.embeddingStatus];

  if (statuses.includes('FAILED')) {
    return { label: '영상 처리 실패', variant: 'destructive' };
  }

  if (statuses.every((status) => status === 'SUCCESS')) {
    return { label: '영상 준비됨', variant: 'success' };
  }

  if (video.transcriptStatus === 'NOT_AVAILABLE') {
    return { label: '자막 사용할 수 없음', variant: 'muted' };
  }

  if (video.isProcessing || statuses.includes('PROCESSING')) {
    return { label: '영상 처리 중', variant: 'warning' };
  }

  const pendingLabel = getPendingVideoLabel(video);
  return { label: pendingLabel, variant: 'secondary' };
}

function getPendingVideoLabel(video: VideoSummaryResponse) {
  if (video.metadataStatus === 'PENDING') return 'metadata 대기 중';
  if (video.transcriptStatus === 'PENDING') return '자막 대기 중';
  if (video.embeddingStatus === 'PENDING') return '임베딩 대기 중';

  return '영상 처리 대기 중';
}

function getListStatusLabel(
  state: AsyncState<PaginatedResponse<PostListItemResponse>>,
  meta: PaginationMeta,
): {
  label: string;
  variant: BadgeVariant;
} {
  if (state.status === 'loading') {
    return { label: '불러오는 중', variant: 'secondary' };
  }

  if (state.status === 'error') {
    return { label: '오류', variant: 'destructive' };
  }

  if (meta.total === 0) {
    return { label: '비어 있음', variant: 'muted' };
  }

  return { label: '조회됨', variant: 'success' };
}
