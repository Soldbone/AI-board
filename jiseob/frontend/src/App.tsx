import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  FileText,
  Heart,
  LogIn,
  LogOut,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  login as loginUser,
  logout as logoutUser,
  restoreSession,
  signup as signupUser,
} from '@/api/auth';
import { createAgentRun, getAgentRun } from '@/api/agent';
import { ApiRequestError, clearApiSession } from '@/api/client';
import {
  createSummary,
  createComment,
  createReply,
  deleteComment,
  getEvidences,
  getSummary,
  listComments,
  updateComment,
} from '@/api/comments';
import {
  createPost,
  deletePost,
  getPost,
  incrementPostView,
  likePost,
  listPosts,
  listTags,
  unlikePost,
  updatePost,
} from '@/api/posts';
import { getVideo } from '@/api/videos';
import type {
  AgentEvidenceCandidateResponse,
  AgentRunResponse,
  AgentRunStatus,
  AgentToolUseResponse,
  AiAnalysisStatus,
  CommentEvidencesResponse,
  CommentResponse,
  CommentType,
  CreateAgentRunResponse,
  EvidenceResponse,
  ModerationStatus,
  PaginatedResponse,
  PaginationMeta,
  PostListItemResponse,
  PostResponse,
  RagStatus,
  SummaryResponse,
  SummaryStatus,
  TagResponse,
  UserResponse,
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
  | { name: 'post-edit'; postId: string }
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

type SessionState =
  | { status: 'checking'; user: null; error: null }
  | { status: 'anonymous'; user: null; error: string | null }
  | { status: 'authenticated'; user: UserResponse; error: null };

type LogoutState = 'idle' | 'submitting';

type WriteNotice = {
  tone: 'destructive' | 'info' | 'success';
  message: string;
};

type EvidenceTarget = {
  commentId: string;
  authorNickname: string;
  createdAt: string;
};

type SummaryPanelState =
  | { status: 'idle' | 'loading' | 'empty'; data: SummaryResponse | null; error: null }
  | { status: 'success'; data: SummaryResponse; error: null }
  | { status: 'error'; data: SummaryResponse | null; error: string };

type AgentPanelRun = AgentRunResponse | CreateAgentRunResponse;

type AgentPanelState =
  | { status: 'idle' | 'loading'; data: AgentPanelRun | null; error: null }
  | { status: 'success'; data: AgentPanelRun; error: null }
  | { status: 'error'; data: AgentPanelRun | null; error: string };

const POSTS_LIMIT = 20;
const DEFAULT_AUTH_REDIRECT = '/?page=1&limit=20';

function parseRoute(pathname: string): Route {
  if (pathname === '/') return { name: 'posts' };
  if (pathname === '/login') return { name: 'login' };
  if (pathname === '/signup') return { name: 'signup' };
  if (pathname === '/posts/new') return { name: 'new-post' };
  if (pathname === '/admin/comments') return { name: 'admin-comments' };

  const postEditMatch = pathname.match(/^\/posts\/([^/]+)\/edit$/);
  if (postEditMatch) return { name: 'post-edit', postId: postEditMatch[1] };

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
  const [session, setSession] = useState<SessionState>({
    status: 'checking',
    user: null,
    error: null,
  });
  const [logoutState, setLogoutState] = useState<LogoutState>('idle');
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    restoreSession()
      .then((user) => {
        if (!ignore) {
          setSession({ status: 'authenticated', user, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setSession({
            status: 'anonymous',
            user: null,
            error: getSessionRestoreMessage(error),
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleAuthenticated = (user: UserResponse) => {
    setLogoutError(null);
    setSession({ status: 'authenticated', user, error: null });
  };

  const handleLogout = async () => {
    if (logoutState === 'submitting') return;

    setLogoutState('submitting');
    setLogoutError(null);

    try {
      await logoutUser();
      setSession({ status: 'anonymous', user: null, error: null });
      navigate(DEFAULT_AUTH_REDIRECT);
    } catch (error: unknown) {
      if (isAuthExpiredError(error)) {
        clearApiSession();
        setSession({ status: 'anonymous', user: null, error: null });
        navigate(buildLoginPath(getCurrentPath()));
      } else {
        setLogoutError(formatApiError(error));
      }
    } finally {
      setLogoutState('idle');
    }
  };

  return (
    <div className="min-h-svh bg-background text-foreground">
      <TopNav
        logoutState={logoutState}
        navigate={navigate}
        onLogout={handleLogout}
        route={route}
        session={session}
      />
      {logoutError && <AppNotice message={logoutError} tone="destructive" />}
      <main className="mx-auto grid w-[min(1240px,calc(100%-28px))] grid-cols-1 gap-6 py-6 lg:w-[min(1240px,calc(100%-48px))] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:py-8">
        {renderRoute(route, navigate, locationSearch, session, handleAuthenticated)}
      </main>
    </div>
  );
}

function renderRoute(
  route: Route,
  navigate: Navigate,
  locationSearch: string,
  session: SessionState,
  onAuthenticated: (user: UserResponse) => void,
) {
  switch (route.name) {
    case 'posts':
      return <PostsIndex locationSearch={locationSearch} navigate={navigate} />;
    case 'post-detail':
      return (
        <PostDetail
          locationSearch={locationSearch}
          navigate={navigate}
          postId={route.postId}
          session={session}
        />
      );
    case 'post-edit':
      return <PostEditor mode="edit" navigate={navigate} postId={route.postId} session={session} />;
    case 'login':
      return (
        <AuthScreen
          locationSearch={locationSearch}
          mode="login"
          navigate={navigate}
          onAuthenticated={onAuthenticated}
          session={session}
        />
      );
    case 'signup':
      return (
        <AuthScreen
          locationSearch={locationSearch}
          mode="signup"
          navigate={navigate}
          onAuthenticated={onAuthenticated}
          session={session}
        />
      );
    case 'new-post':
      return <PostEditor mode="create" navigate={navigate} session={session} />;
    case 'admin-comments':
      return <AdminCommentsPlaceholder navigate={navigate} session={session} />;
    case 'not-found':
      return <NotFound navigate={navigate} />;
  }
}

function TopNav({
  logoutState,
  navigate,
  onLogout,
  route,
  session,
}: {
  logoutState: LogoutState;
  navigate: Navigate;
  onLogout: () => void;
  route: Route;
  session: SessionState;
}) {
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
          {session.status === 'checking' && (
            <Badge className="min-w-fit" variant="secondary">
              세션 확인 중
            </Badge>
          )}

          {session.status === 'anonymous' && (
            <>
              <Button
                className={cn(isActive('login') && 'bg-accent')}
                onClick={() => navigate('/login')}
                variant="outline"
              >
                <LogIn className="size-4" aria-hidden="true" />
                Login
              </Button>
              <Button
                className={cn(isActive('signup') && 'bg-accent')}
                onClick={() => navigate('/signup')}
                variant="outline"
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Sign up
              </Button>
            </>
          )}

          {session.status === 'authenticated' && (
            <>
              <Badge className="max-w-[160px] truncate" variant="outline">
                {session.user.nickname}
              </Badge>
              {session.user.role === 'ADMIN' && (
                <Button
                  className={cn(isActive('admin-comments') && 'bg-accent')}
                  onClick={() => navigate('/admin/comments')}
                  variant="outline"
                >
                  <Shield className="size-4" aria-hidden="true" />
                  Admin
                </Button>
              )}
              <Button onClick={() => navigate('/posts/new')}>
                <Plus className="size-4" aria-hidden="true" />
                New post
              </Button>
              <Button disabled={logoutState === 'submitting'} onClick={onLogout} variant="ghost">
                <LogOut className="size-4" aria-hidden="true" />
                {logoutState === 'submitting' ? 'Logging out' : 'Logout'}
              </Button>
            </>
          )}
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

function PostDetail({
  locationSearch,
  navigate,
  postId,
  session,
}: {
  locationSearch: string;
  navigate: Navigate;
  postId: string;
  session: SessionState;
}) {
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
  const [postActionStatus, setPostActionStatus] = useState<
    'idle' | 'deleting' | 'liking' | 'unliking'
  >('idle');
  const [postActionNotice, setPostActionNotice] = useState<WriteNotice | null>(null);
  const [sessionLikedPostIds, setSessionLikedPostIds] = useState<string[]>([]);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const [evidenceState, setEvidenceState] = useState<AsyncState<CommentEvidencesResponse>>({
    status: 'idle',
    data: null,
    error: null,
  });

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

  useEffect(() => {
    if (!evidenceTarget) {
      setEvidenceState({ status: 'idle', data: null, error: null });
      return;
    }

    let ignore = false;

    setEvidenceState((current) => ({
      status: 'loading',
      data: current.data?.commentId === evidenceTarget.commentId ? current.data : null,
      error: null,
    }));

    getEvidences(evidenceTarget.commentId)
      .then((data) => {
        if (!ignore) {
          setEvidenceState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setEvidenceState((current) => ({
            status: 'error',
            data: current.data,
            error: formatApiError(error),
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, [evidenceTarget]);

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

  const canManagePost = session.status === 'authenticated' && session.user.id === post.author.id;
  const routeNotice = getPostRouteNotice(locationSearch);
  const isSessionLiked = sessionLikedPostIds.includes(post.id);
  const isLikeBusy = postActionStatus === 'liking' || postActionStatus === 'unliking';

  const handleDeletePost = async () => {
    if (postActionStatus === 'deleting') return;
    if (
      !window.confirm('게시글을 삭제할까요? 삭제된 게시글은 목록과 상세에서 노출되지 않습니다.')
    ) {
      return;
    }

    setPostActionStatus('deleting');
    setPostActionNotice(null);

    try {
      await deletePost(post.id);
      navigate(DEFAULT_AUTH_REDIRECT);
    } catch (error: unknown) {
      handleWriteError(error, navigate, setPostActionNotice);
    } finally {
      setPostActionStatus('idle');
    }
  };

  const handleLikePost = async () => {
    if (session.status !== 'authenticated') {
      navigate(buildLoginPath(getCurrentPath()));
      return;
    }

    if (isLikeBusy) return;

    setPostActionStatus('liking');
    setPostActionNotice(null);

    try {
      const response = await likePost(post.id);

      setSessionLikedPostIds((current) =>
        current.includes(post.id) ? current : [...current, post.id],
      );
      setPostState((current) => {
        if (current.status !== 'success' || current.data.id !== post.id) return current;

        return {
          status: 'success',
          data: { ...current.data, likeCount: response.likeCount },
          error: null,
        };
      });
      setPostActionNotice({ tone: 'success', message: '좋아요를 반영했습니다.' });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSessionLikedPostIds((current) =>
          current.includes(post.id) ? current : [...current, post.id],
        );
        setPostActionNotice({
          tone: 'info',
          message: '이미 좋아요한 게시글입니다. 현재 세션에서는 취소할 수 있습니다.',
        });
        setPostReloadKey((key) => key + 1);
      } else {
        handleWriteError(error, navigate, setPostActionNotice);
      }
    } finally {
      setPostActionStatus('idle');
    }
  };

  const handleUnlikePost = async () => {
    if (session.status !== 'authenticated') {
      navigate(buildLoginPath(getCurrentPath()));
      return;
    }

    if (isLikeBusy) return;

    setPostActionStatus('unliking');
    setPostActionNotice(null);

    try {
      await unlikePost(post.id);
      setSessionLikedPostIds((current) => current.filter((postId) => postId !== post.id));
      setPostActionNotice({ tone: 'success', message: '좋아요를 취소했습니다.' });
      setPostReloadKey((key) => key + 1);
    } catch (error: unknown) {
      handleWriteError(error, navigate, setPostActionNotice);
    } finally {
      setPostActionStatus('idle');
    }
  };

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

        {routeNotice && <InlineNotice message={routeNotice.message} tone={routeNotice.tone} />}
        {postActionNotice && (
          <InlineNotice message={postActionNotice.message} tone={postActionNotice.tone} />
        )}

        <PostDetailHeader
          canManagePost={canManagePost}
          isDeleting={postActionStatus === 'deleting'}
          isLikeBusy={isLikeBusy}
          isSessionLiked={isSessionLiked}
          navigate={navigate}
          onDelete={handleDeletePost}
          onLike={handleLikePost}
          onUnlike={handleUnlikePost}
          post={post}
          session={session}
        />

        <PostVideoSection
          fallbackVideo={post.video}
          onRetry={() => setVideoReloadKey((key) => key + 1)}
          state={videoState}
        />

        <PostBody post={post} />

        <CommentsSection
          navigate={navigate}
          onChanged={() => {
            setCommentsReloadKey((key) => key + 1);
            setPostReloadKey((key) => key + 1);
          }}
          onOpenEvidence={(comment) =>
            setEvidenceTarget({
              authorNickname: comment.author.nickname,
              commentId: comment.id,
              createdAt: comment.createdAt,
            })
          }
          onRetry={() => setCommentsReloadKey((key) => key + 1)}
          postId={post.id}
          session={session}
          state={commentsState}
        />
      </section>

      <DetailSidePanel
        comments={commentsState.data ?? []}
        navigate={navigate}
        post={post}
        session={session}
        videoState={videoState}
      />
      <EvidenceSheet
        onClose={() => setEvidenceTarget(null)}
        onRetry={() => {
          if (!evidenceTarget) return;
          setEvidenceState({ status: 'loading', data: evidenceState.data, error: null });
          getEvidences(evidenceTarget.commentId)
            .then((data) => setEvidenceState({ status: 'success', data, error: null }))
            .catch((error: unknown) =>
              setEvidenceState((current) => ({
                status: 'error',
                data: current.data,
                error: formatApiError(error),
              })),
            );
        }}
        state={evidenceState}
        target={evidenceTarget}
      />
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

function PostDetailHeader({
  canManagePost,
  isDeleting,
  isLikeBusy,
  isSessionLiked,
  navigate,
  onDelete,
  onLike,
  onUnlike,
  post,
  session,
}: {
  canManagePost: boolean;
  isDeleting: boolean;
  isLikeBusy: boolean;
  isSessionLiked: boolean;
  navigate: Navigate;
  onDelete: () => void;
  onLike: () => void;
  onUnlike: () => void;
  post: PostResponse;
  session: SessionState;
}) {
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

      {canManagePost && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(`/posts/${post.id}/edit`)} size="sm" variant="outline">
            <FileText className="size-4" aria-hidden="true" />
            수정
          </Button>
          <Button disabled={isDeleting} onClick={onDelete} size="sm" variant="destructive">
            <Trash2 className="size-4" aria-hidden="true" />
            {isDeleting ? '삭제 중' : '삭제'}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {session.status === 'authenticated' ? (
          isSessionLiked ? (
            <Button disabled={isLikeBusy} onClick={onUnlike} size="sm" variant="outline">
              <Heart className="size-4" aria-hidden="true" />
              {isLikeBusy ? '처리 중' : '좋아요 취소'}
            </Button>
          ) : (
            <Button disabled={isLikeBusy} onClick={onLike} size="sm" variant="outline">
              <Heart className="size-4" aria-hidden="true" />
              {isLikeBusy ? '처리 중' : '좋아요'}
            </Button>
          )
        ) : (
          <Button
            onClick={() => navigate(buildLoginPath(getCurrentPath()))}
            size="sm"
            variant="outline"
          >
            <Heart className="size-4" aria-hidden="true" />
            로그인 후 좋아요
          </Button>
        )}
      </div>
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
  navigate,
  onChanged,
  onOpenEvidence,
  onRetry,
  postId,
  session,
  state,
}: {
  navigate: Navigate;
  onChanged: () => void;
  onOpenEvidence: (comment: CommentResponse) => void;
  onRetry: () => void;
  postId: string;
  session: SessionState;
  state: AsyncState<CommentResponse[]>;
}) {
  const comments = state.data ?? [];
  const totalCommentCount = countComments(comments);
  const [content, setContent] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting'>('idle');
  const [notice, setNotice] = useState<WriteNotice | null>(null);
  const canWrite = session.status === 'authenticated';

  const handleCreateComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canWrite) {
      navigate(buildLoginPath(getCurrentPath()));
      return;
    }

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      setNotice({ tone: 'destructive', message: '댓글 내용을 입력해 주세요.' });
      return;
    }

    setSubmitStatus('submitting');
    setNotice(null);

    try {
      await createComment(postId, { content: trimmedContent });
      setContent('');
      setNotice({
        tone: 'success',
        message: '댓글이 등록되었습니다. AI 분석은 별도로 진행됩니다.',
      });
      onChanged();
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
    } finally {
      setSubmitStatus('idle');
    }
  };

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
          {!canWrite && (
            <Button
              onClick={() => navigate(buildLoginPath(getCurrentPath()))}
              size="sm"
              variant="outline"
            >
              로그인 후 댓글
            </Button>
          )}
        </div>
      </div>

      {canWrite && (
        <form
          className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3"
          onSubmit={handleCreateComment}
        >
          <label className="grid gap-2 text-sm font-medium">
            새 댓글
            <Textarea
              disabled={submitStatus === 'submitting'}
              onChange={(event) => setContent(event.target.value)}
              placeholder="토론에 참여할 의견이나 질문을 남깁니다."
              value={content}
            />
          </label>
          {notice && <InlineNotice message={notice.message} tone={notice.tone} />}
          <div className="flex justify-end">
            <Button disabled={submitStatus === 'submitting'} size="sm" type="submit">
              <Send className="size-4" aria-hidden="true" />
              {submitStatus === 'submitting' ? '등록 중' : '댓글 등록'}
            </Button>
          </div>
        </form>
      )}

      {!canWrite && (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm leading-6 text-muted-foreground">
          로그인하면 댓글과 대댓글을 작성할 수 있습니다.
        </p>
      )}

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
            <CommentThread
              comment={comment}
              key={comment.id}
              navigate={navigate}
              onChanged={onChanged}
              onOpenEvidence={onOpenEvidence}
              session={session}
            />
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

function CommentThread({
  comment,
  navigate,
  onChanged,
  onOpenEvidence,
  session,
}: {
  comment: CommentResponse;
  navigate: Navigate;
  onChanged: () => void;
  onOpenEvidence: (comment: CommentResponse) => void;
  session: SessionState;
}) {
  const replies = comment.replies ?? [];

  return (
    <div className="grid gap-3">
      <CommentItem
        comment={comment}
        level={0}
        navigate={navigate}
        onChanged={onChanged}
        onOpenEvidence={onOpenEvidence}
        session={session}
      />
      {replies.map((reply) => (
        <CommentItem
          comment={reply}
          key={reply.id}
          level={1}
          navigate={navigate}
          onChanged={onChanged}
          onOpenEvidence={onOpenEvidence}
          session={session}
        />
      ))}
      <CommentSummaryPanel comment={comment} navigate={navigate} session={session} />
    </div>
  );
}

function CommentItem({
  comment,
  level,
  navigate,
  onChanged,
  onOpenEvidence,
  session,
}: {
  comment: CommentResponse;
  level: 0 | 1;
  navigate: Navigate;
  onChanged: () => void;
  onOpenEvidence: (comment: CommentResponse) => void;
  session: SessionState;
}) {
  const isReply = level === 1;
  const isDeleted = comment.isDeleted || comment.moderationStatus === 'DELETED_BY_ADMIN';
  const moderationBadge = getModerationStatusLabel(comment.moderationStatus);
  const canWrite = session.status === 'authenticated';
  const canManageComment = canWrite && session.user.id === comment.author.id && !isDeleted;
  const canReply = canWrite && !isReply && !isDeleted;
  const canShowEvidence = canShowEvidenceAction(comment);
  const [mode, setMode] = useState<'idle' | 'reply' | 'edit'>('idle');
  const [replyContent, setReplyContent] = useState('');
  const [editContent, setEditContent] = useState(comment.content);
  const [actionStatus, setActionStatus] = useState<'idle' | 'submitting' | 'deleting'>('idle');
  const [notice, setNotice] = useState<WriteNotice | null>(null);

  useEffect(() => {
    setEditContent(comment.content);
    setMode('idle');
    setReplyContent('');
    setNotice(null);
  }, [comment.content, comment.id]);

  const handleCreateReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canWrite) {
      navigate(buildLoginPath(getCurrentPath()));
      return;
    }

    const trimmedContent = replyContent.trim();

    if (!trimmedContent) {
      setNotice({ tone: 'destructive', message: '대댓글 내용을 입력해 주세요.' });
      return;
    }

    setActionStatus('submitting');
    setNotice(null);

    try {
      await createReply(comment.id, { content: trimmedContent });
      setReplyContent('');
      setMode('idle');
      setNotice({
        tone: 'success',
        message: '댓글이 등록되었습니다. AI 분석은 별도로 진행됩니다.',
      });
      onChanged();
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
    } finally {
      setActionStatus('idle');
    }
  };

  const handleUpdateComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedContent = editContent.trim();

    if (!trimmedContent) {
      setNotice({ tone: 'destructive', message: '댓글 내용을 입력해 주세요.' });
      return;
    }

    setActionStatus('submitting');
    setNotice(null);

    try {
      await updateComment(comment.id, { content: trimmedContent });
      setMode('idle');
      setNotice({
        tone: 'success',
        message: '댓글이 수정되었습니다. AI 분석은 다시 진행될 수 있습니다.',
      });
      onChanged();
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
    } finally {
      setActionStatus('idle');
    }
  };

  const handleDeleteComment = async () => {
    if (actionStatus === 'deleting') return;
    if (!window.confirm('댓글을 삭제할까요? 삭제된 댓글은 placeholder로 표시됩니다.')) {
      return;
    }

    setActionStatus('deleting');
    setNotice(null);

    try {
      await deleteComment(comment.id);
      setNotice({ tone: 'success', message: '댓글이 삭제되었습니다.' });
      onChanged();
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
    } finally {
      setActionStatus('idle');
    }
  };

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

      {mode === 'edit' ? (
        <form className="grid gap-3" onSubmit={handleUpdateComment}>
          <Textarea
            disabled={actionStatus === 'submitting'}
            onChange={(event) => setEditContent(event.target.value)}
            value={editContent}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={actionStatus === 'submitting'} size="sm" type="submit">
              {actionStatus === 'submitting' ? '저장 중' : '수정 저장'}
            </Button>
            <Button onClick={() => setMode('idle')} size="sm" variant="outline">
              취소
            </Button>
          </div>
        </form>
      ) : (
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-sm leading-6',
            isDeleted ? 'text-muted-foreground' : 'text-neutral-800',
          )}
        >
          {comment.content}
        </p>
      )}

      <CommentAnalysisBadges comment={comment} />

      {notice && <InlineNotice message={notice.message} tone={notice.tone} />}

      {!isDeleted && (
        <div className="flex flex-wrap gap-2">
          {canShowEvidence ? (
            <Button onClick={() => onOpenEvidence(comment)} size="sm" variant="outline">
              {getEvidenceActionLabel(comment)}
            </Button>
          ) : null}
          {canReply && (
            <Button
              onClick={() => setMode((current) => (current === 'reply' ? 'idle' : 'reply'))}
              size="sm"
              variant="outline"
            >
              답글
            </Button>
          )}
          {canManageComment && (
            <>
              <Button onClick={() => setMode('edit')} size="sm" variant="outline">
                수정
              </Button>
              <Button
                disabled={actionStatus === 'deleting'}
                onClick={handleDeleteComment}
                size="sm"
                variant="destructive"
              >
                {actionStatus === 'deleting' ? '삭제 중' : '삭제'}
              </Button>
            </>
          )}
        </div>
      )}

      {mode === 'reply' && canReply && (
        <form
          className="grid gap-3 rounded-md border border-border bg-background p-3"
          onSubmit={handleCreateReply}
        >
          <Textarea
            disabled={actionStatus === 'submitting'}
            onChange={(event) => setReplyContent(event.target.value)}
            placeholder="대댓글을 입력합니다."
            value={replyContent}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={actionStatus === 'submitting'} size="sm" type="submit">
              {actionStatus === 'submitting' ? '등록 중' : '대댓글 등록'}
            </Button>
            <Button onClick={() => setMode('idle')} size="sm" variant="outline">
              취소
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

function CommentSummaryPanel({
  comment,
  navigate,
  session,
}: {
  comment: CommentResponse;
  navigate: Navigate;
  session: SessionState;
}) {
  const [summaryState, setSummaryState] = useState<SummaryPanelState>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [requestStatus, setRequestStatus] = useState<'idle' | 'submitting'>('idle');
  const [notice, setNotice] = useState<WriteNotice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [pollExpired, setPollExpired] = useState(false);
  const summarizableCount = countSummarizableThreadComments(comment);
  const hasEnoughComments = summarizableCount >= 10;
  const canRequestSummary = hasEnoughComments && !isCommentDeleted(comment);
  const threadRevision = getCommentThreadRevision(comment);
  const summary = summaryState.data;
  const isRunning = summary ? isSummaryRunning(summary.status) : false;

  useEffect(() => {
    let ignore = false;

    setSummaryState((current) => ({
      status: 'loading',
      data: current.data?.rootCommentId === comment.id ? current.data : null,
      error: null,
    }));

    getSummary(comment.id)
      .then((data) => {
        if (!ignore) {
          setSummaryState({ status: 'success', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (ignore) return;

        if (isNotFoundError(error)) {
          setSummaryState({ status: 'empty', data: null, error: null });
          return;
        }

        setSummaryState((current) => ({
          status: 'error',
          data: current.data,
          error: formatApiError(error),
        }));
      });

    return () => {
      ignore = true;
    };
  }, [comment.id, reloadKey, threadRevision]);

  useEffect(() => {
    if (!summary || !isSummaryRunning(summary.status)) {
      setPollStartedAt(null);
      setPollExpired(false);
      return;
    }

    if (pollStartedAt === null) {
      setPollStartedAt(Date.now());
      setPollExpired(false);
    }
  }, [pollStartedAt, summary]);

  useEffect(() => {
    if (!summary || !isSummaryRunning(summary.status) || pollStartedAt === null || pollExpired) {
      return;
    }

    if (document.visibilityState === 'hidden') return;

    const elapsed = Date.now() - pollStartedAt;

    if (elapsed >= 90_000) {
      setPollExpired(true);
      return;
    }

    const delay = elapsed >= 30_000 ? 3_000 : 1_000;
    const timeoutId = window.setTimeout(() => setReloadKey((key) => key + 1), delay);

    return () => window.clearTimeout(timeoutId);
  }, [pollExpired, pollStartedAt, summary]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        summary &&
        isSummaryRunning(summary.status) &&
        !pollExpired
      ) {
        setReloadKey((key) => key + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pollExpired, summary]);

  const handleRequestSummary = async () => {
    if (!canRequestSummary) {
      setNotice({ tone: 'info', message: '요약할 댓글이 충분하지 않습니다.' });
      return;
    }

    if (session.status !== 'authenticated') {
      navigate(buildLoginPath(getCurrentPath()));
      return;
    }

    setRequestStatus('submitting');
    setNotice(null);

    try {
      const data = await createSummary(comment.id);
      setSummaryState({ status: 'success', data, error: null });
      setNotice({ tone: 'success', message: '요약 요청이 접수되었습니다.' });

      if (isSummaryRunning(data.status)) {
        setPollStartedAt(Date.now());
        setPollExpired(false);
      }
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
    } finally {
      setRequestStatus('idle');
    }
  };

  return (
    <section className="ml-0 grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:ml-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">댓글 스레드 요약</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            루트 댓글과 직계 대댓글을 기준으로 생성된 보조 요약입니다.
          </p>
        </div>
        <Badge variant={hasEnoughComments ? 'secondary' : 'muted'}>
          요약 대상 {summarizableCount.toLocaleString()}개
        </Badge>
      </div>

      {!hasEnoughComments && (
        <p className="rounded-md bg-background p-3 text-sm leading-6 text-muted-foreground">
          요약할 댓글이 충분하지 않습니다.
        </p>
      )}

      <SummaryPanelContent onRetry={() => setReloadKey((key) => key + 1)} state={summaryState} />

      {summary?.isStale && (
        <InlineNotice
          message="새 댓글이 추가되어 요약이 최신 상태가 아닐 수 있습니다."
          tone="info"
        />
      )}

      {notice && <InlineNotice message={notice.message} tone={notice.tone} />}

      <div className="flex flex-wrap gap-2">
        {session.status === 'authenticated' ? (
          <Button
            disabled={!canRequestSummary || requestStatus === 'submitting' || isRunning}
            onClick={handleRequestSummary}
            size="sm"
            variant={summary?.status === 'FAILED' ? 'destructive' : 'outline'}
          >
            {getSummaryActionLabel(summary, requestStatus)}
          </Button>
        ) : (
          <Button
            disabled={!canRequestSummary}
            onClick={() => navigate(buildLoginPath(getCurrentPath()))}
            size="sm"
            variant="outline"
          >
            로그인 후 요약
          </Button>
        )}

        {isRunning && (
          <Button onClick={() => setReloadKey((key) => key + 1)} size="sm" variant="outline">
            <RefreshCw className="size-4" aria-hidden="true" />
            상태 새로고침
          </Button>
        )}
      </div>

      {isRunning && (
        <p className="text-sm leading-6 text-muted-foreground">
          {pollExpired
            ? '요약이 아직 완료되지 않았습니다. 수동으로 상태를 새로고침해 주세요.'
            : '요약 상태를 자동으로 확인하는 중입니다.'}
        </p>
      )}
    </section>
  );
}

function SummaryPanelContent({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: SummaryPanelState;
}) {
  const data = state.data;

  if (state.status === 'loading' && !data) {
    return (
      <div className="grid gap-2" aria-label="댓글 요약 로딩 중">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <p className="rounded-md bg-background p-3 text-sm leading-6 text-muted-foreground">
        아직 생성된 요약이 없습니다.
      </p>
    );
  }

  if (state.status === 'error' && !data) {
    return (
      <div className="grid gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
        <InlineNotice message={`요약을 불러오지 못했습니다. ${state.error}`} tone="destructive" />
        <Button className="w-fit" onClick={onRetry} size="sm" variant="destructive">
          <RefreshCw className="size-4" aria-hidden="true" />
          다시 조회
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const statusLabel = getSummaryStatusLabel(data.status);

  return (
    <div className="grid gap-3" aria-busy={state.status === 'loading'}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
        <Badge variant="muted">
          {data.summarizedCommentCount.toLocaleString()} /{' '}
          {data.currentCommentCount.toLocaleString()}개 반영
        </Badge>
      </div>

      {data.status === 'SUCCESS' && data.summaryText ? (
        <p className="whitespace-pre-wrap break-words rounded-md bg-background p-3 text-sm leading-6 text-neutral-800">
          {data.summaryText}
        </p>
      ) : data.status === 'FAILED' ? (
        <div className="rounded-md bg-destructive/5 p-3 text-sm leading-6 text-destructive">
          요약을 생성하지 못했습니다.
          {data.errorCode ? ` 오류 코드: ${data.errorCode}` : ''}
        </div>
      ) : (
        <p className="rounded-md bg-background p-3 text-sm leading-6 text-muted-foreground">
          요약을 준비하는 중입니다.
        </p>
      )}

      {data.generatedAt && (
        <p className="text-xs text-muted-foreground">생성 {formatDateTime(data.generatedAt)}</p>
      )}

      {state.status === 'error' && (
        <InlineNotice
          message={`요약을 새로 불러오지 못했습니다. ${state.error}`}
          tone="destructive"
        />
      )}
    </div>
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

function EvidenceSheet({
  onClose,
  onRetry,
  state,
  target,
}: {
  onClose: () => void;
  onRetry: () => void;
  state: AsyncState<CommentEvidencesResponse>;
  target: EvidenceTarget | null;
}) {
  if (!target) return null;

  const data = state.data;
  const statusLabel = data ? getRagStatusLabel(data.ragStatus) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" role="presentation">
      <button
        aria-label="근거 후보 sheet 닫기"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-modal="true"
        className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background shadow-xl"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Evidence sheet</p>
            <h2 className="mt-1 text-lg font-semibold">근거 후보</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {target.authorNickname} · {formatDateTime(target.createdAt)}
            </p>
          </div>
          <Button aria-label="근거 후보 sheet 닫기" onClick={onClose} size="sm" variant="ghost">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="grid gap-4 p-4 sm:p-5">
          <InlineNotice
            message="근거 후보는 관련 있을 수 있는 자막 구간이며, 사실 여부를 최종 판정하지 않습니다."
            tone="info"
          />

          {state.status === 'loading' && !data && (
            <div className="grid gap-3" aria-label="근거 후보 로딩 중">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          )}

          {state.status === 'error' && (
            <div className="grid gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <InlineNotice
                message={`근거 후보를 불러오지 못했습니다. ${state.error}`}
                tone="destructive"
              />
              <Button className="w-fit" onClick={onRetry} size="sm" variant="destructive">
                <RefreshCw className="size-4" aria-hidden="true" />
                다시 조회
              </Button>
            </div>
          )}

          {data && (
            <div className="grid gap-4" aria-busy={state.status === 'loading'}>
              <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>RAG 상태</span>
                  {statusLabel && <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>}
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>근거 후보 수</span>
                  <Badge variant={data.evidenceCount > 0 ? 'success' : 'muted'}>
                    {data.evidenceCount.toLocaleString()}개
                  </Badge>
                </div>
              </div>

              <EvidenceSheetContent evidences={data.evidences} response={data} />

              {state.status === 'loading' && (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  근거 후보를 새로 불러오는 중입니다.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function EvidenceSheetContent({
  evidences,
  response,
}: {
  evidences: EvidenceResponse[];
  response: CommentEvidencesResponse;
}) {
  if (response.ragStatus === 'FAILED') {
    return (
      <div className="grid gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm leading-6 text-destructive">
        <p className="font-medium">근거 후보를 준비하지 못했습니다.</p>
        <p>
          영상 처리나 자막 검색 상태를 확인한 뒤 다시 조회해 주세요.
          {response.ragErrorCode ? ` 오류 코드: ${response.ragErrorCode}` : ''}
        </p>
      </div>
    );
  }

  if (response.ragStatus === 'PENDING' || response.ragStatus === 'PROCESSING') {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
        근거 후보를 준비하는 중입니다. 영상 자막과 임베딩 처리가 끝난 뒤 다시 확인할 수 있습니다.
      </div>
    );
  }

  if (response.ragStatus === 'NO_RESULT' || evidences.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
        관련 있을 수 있는 자막 구간이 아직 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {evidences.map((evidence, index) => (
        <EvidenceItem evidence={evidence} index={index} key={evidence.id} />
      ))}
    </div>
  );
}

function EvidenceItem({ evidence, index }: { evidence: EvidenceResponse; index: number }) {
  return (
    <article className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">관련 있을 수 있는 자막 구간 {index + 1}</h3>
        <Badge variant="secondary">{formatSimilarityScore(evidence.similarityScore)}</Badge>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800">
        {evidence.evidenceText}
      </p>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>
          {formatTranscriptTime(evidence.startTime)} - {formatTranscriptTime(evidence.endTime)}
        </span>
        <span>저장 {formatDateTime(evidence.createdAt)}</span>
      </div>
    </article>
  );
}

function AuthScreen({
  locationSearch,
  mode,
  navigate,
  onAuthenticated,
  session,
}: {
  locationSearch: string;
  mode: 'login' | 'signup';
  navigate: Navigate;
  onAuthenticated: (user: UserResponse) => void;
  session: SessionState;
}) {
  const isLogin = mode === 'login';
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setEmail('');
    setNickname('');
    setPassword('');
    setAuthStatus('idle');
    setError(null);
    setSuccessMessage(null);
  }, [mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedNickname = nickname.trim();

    if (!trimmedEmail || !password || (!isLogin && !trimmedNickname)) {
      setError('필수 정보를 입력해 주세요.');
      return;
    }

    setAuthStatus('submitting');
    setError(null);
    setSuccessMessage(null);

    try {
      if (isLogin) {
        const response = await loginUser({ email: trimmedEmail, password });
        onAuthenticated(response.user);
        navigate(getSafeNextPath(locationSearch));
      } else {
        const user = await signupUser({
          email: trimmedEmail,
          nickname: trimmedNickname,
          password,
        });

        setAuthStatus('success');
        setSuccessMessage(`${user.nickname} 계정이 생성되었습니다. 로그인해 주세요.`);
        setPassword('');
      }
    } catch (submitError: unknown) {
      setAuthStatus('idle');
      setError(formatApiError(submitError));
    }
  };

  if (session.status === 'checking') {
    return (
      <>
        <SessionChecking title={isLogin ? '로그인' : '회원가입'} />
        <AuthSidePanel session={session} />
      </>
    );
  }

  if (session.status === 'authenticated') {
    return (
      <>
        <section
          className="flex min-w-0 flex-col gap-5"
          aria-label={isLogin ? 'Already logged in' : 'Authenticated account'}
        >
          <PageHeading
            eyebrow="Session ready"
            title="이미 로그인되어 있습니다"
            description={`${session.user.nickname} 계정으로 Arena를 사용 중입니다.`}
            badge={
              <Badge variant={session.user.role === 'ADMIN' ? 'warning' : 'success'}>
                {session.user.role}
              </Badge>
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(DEFAULT_AUTH_REDIRECT)}>
              <User className="size-4" aria-hidden="true" />
              게시글 목록으로 이동
            </Button>
            {session.user.role === 'ADMIN' && (
              <Button onClick={() => navigate('/admin/comments')} variant="outline">
                <Shield className="size-4" aria-hidden="true" />
                관리자 댓글 검토
              </Button>
            )}
          </div>
        </section>

        <AuthSidePanel session={session} />
      </>
    );
  }

  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label={isLogin ? 'Login' : 'Signup'}>
        <PageHeading
          eyebrow={isLogin ? 'Auth' : 'Account'}
          title={isLogin ? '로그인' : '회원가입'}
          description={
            isLogin
              ? '토론 작성과 관리자 작업에 필요한 세션을 준비합니다.'
              : 'Arena에서 사용할 계정을 생성합니다. 가입 후 로그인해 주세요.'
          }
          badge={
            <Badge variant={isLogin ? 'info' : 'secondary'}>
              {isLogin ? 'session' : 'new user'}
            </Badge>
          }
        />

        <form
          className="grid max-w-xl gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
          onSubmit={handleSubmit}
        >
          {!isLogin && (
            <label className="grid gap-2 text-sm font-medium">
              Nickname
              <Input
                autoComplete="nickname"
                disabled={authStatus === 'submitting'}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="arena-user"
                required
                value={nickname}
              />
            </label>
          )}
          <label className="grid gap-2 text-sm font-medium">
            Email
            <Input
              autoComplete="email"
              disabled={authStatus === 'submitting'}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Password
            <Input
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              disabled={authStatus === 'submitting'}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password123"
              required
              type="password"
              value={password}
            />
          </label>

          {error && (
            <p className="rounded-md bg-destructive/5 p-3 text-sm leading-6 text-destructive">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="rounded-md bg-green-50 p-3 text-sm leading-6 text-green-700">
              {successMessage}
            </p>
          )}

          <Button disabled={authStatus === 'submitting'} type="submit">
            {isLogin ? (
              <LogIn className="size-4" aria-hidden="true" />
            ) : (
              <UserPlus className="size-4" aria-hidden="true" />
            )}
            {authStatus === 'submitting'
              ? isLogin
                ? '로그인 중'
                : '계정 생성 중'
              : isLogin
                ? '로그인'
                : '회원가입'}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Button
            className="w-fit"
            onClick={() =>
              navigate(isLogin ? `/signup${locationSearch}` : `/login${locationSearch}`)
            }
            variant="ghost"
          >
            {isLogin ? '회원가입 화면 보기' : '로그인 화면 보기'}
          </Button>
          {!isLogin && successMessage && (
            <Button
              className="w-fit"
              onClick={() => navigate(`/login${locationSearch}`)}
              variant="outline"
            >
              로그인으로 이동
            </Button>
          )}
        </div>
      </section>

      <AuthSidePanel session={session} />
    </>
  );
}

function PostEditor({
  mode,
  navigate,
  postId,
  session,
}: {
  mode: 'create' | 'edit';
  navigate: Navigate;
  postId?: string;
  session: SessionState;
}) {
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting'>('idle');
  const [notice, setNotice] = useState<WriteNotice | null>(null);
  const [editPostState, setEditPostState] = useState<AsyncState<PostResponse>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [editNotFound, setEditNotFound] = useState(false);
  const [editReloadKey, setEditReloadKey] = useState(0);

  useEffect(() => {
    if (!isEdit || session.status !== 'authenticated' || !postId) {
      return;
    }

    let ignore = false;

    setEditNotFound(false);
    setEditPostState((current) => ({
      status: 'loading',
      data: current.data?.id === postId ? current.data : null,
      error: null,
    }));

    getPost(postId)
      .then((post) => {
        if (ignore) return;

        setEditPostState({ status: 'success', data: post, error: null });
        setTitle(post.title);
        setYoutubeUrl(post.youtubeUrl);
        setContent(post.content);
        setTagsInput(post.tags.map((tag) => tag.name).join(', '));
      })
      .catch((error: unknown) => {
        if (ignore) return;

        setEditNotFound(isNotFoundError(error));
        setEditPostState({ status: 'error', data: null, error: formatApiError(error) });
      });

    return () => {
      ignore = true;
    };
  }, [editReloadKey, isEdit, postId, session.status]);

  if (session.status === 'checking') {
    return (
      <>
        <SessionChecking title={isEdit ? '게시글 수정' : '게시글 작성'} />
        <PlaceholderSide
          title="Write scope"
          items={['post create/update/delete', 'comment write', 'reply write', 'like toggle']}
        />
      </>
    );
  }

  if (session.status === 'anonymous') {
    return (
      <AuthRequired
        actionLabel={isEdit ? '로그인하고 수정하기' : '로그인하고 작성하기'}
        description={
          isEdit
            ? '게시글 수정은 작성자 로그인 후 사용할 수 있습니다.'
            : '게시글 작성은 로그인 후 사용할 수 있습니다.'
        }
        navigate={navigate}
        nextPath={isEdit && postId ? `/posts/${postId}/edit` : '/posts/new'}
        title="로그인이 필요함"
      />
    );
  }

  const editPost = editPostState.data;

  if (isEdit) {
    if (!postId) {
      return <PostDetailNotFound navigate={navigate} />;
    }

    if (editNotFound) {
      return <PostDetailNotFound navigate={navigate} />;
    }

    if (editPostState.status === 'loading' && !editPost) {
      return (
        <>
          <SessionChecking title="게시글 수정" />
          <PlaceholderSide
            title="Edit scope"
            items={['GET /posts/:postId', 'PATCH /posts/:postId', '작성자 권한 확인']}
          />
        </>
      );
    }

    if (editPostState.status === 'error' && !editPost) {
      return (
        <PostDetailError
          error={editPostState.error}
          navigate={navigate}
          onRetry={() => setEditReloadKey((key) => key + 1)}
        />
      );
    }

    if (!editPost) {
      return (
        <>
          <SessionChecking title="게시글 수정" />
          <PlaceholderSide
            title="Edit scope"
            items={['GET /posts/:postId', 'PATCH /posts/:postId', '작성자 권한 확인']}
          />
        </>
      );
    }

    if (editPost.author.id !== session.user.id) {
      return (
        <ForbiddenState
          description="게시글 작성자만 이 게시글을 수정할 수 있습니다."
          navigate={navigate}
          title="권한이 없음"
        />
      );
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const trimmedYoutubeUrl = youtubeUrl.trim();
    const tags = parseTagsInput(tagsInput);

    if (!trimmedTitle || !trimmedContent || (!isEdit && !trimmedYoutubeUrl)) {
      setNotice({ tone: 'destructive', message: '필수 정보를 입력해 주세요.' });
      return;
    }

    setSubmitStatus('submitting');
    setNotice(null);

    try {
      if (isEdit) {
        const updatedPost = await updatePost(postId!, {
          title: trimmedTitle,
          content: trimmedContent,
          tags,
        });

        navigate(`/posts/${updatedPost.id}?updated=1`);
      } else {
        const createdPost = await createPost({
          title: trimmedTitle,
          content: trimmedContent,
          youtubeUrl: trimmedYoutubeUrl,
          tags,
        });

        navigate(`/posts/${createdPost.id}?created=1`);
      }
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
    } finally {
      setSubmitStatus('idle');
    }
  };

  return (
    <>
      <section
        className="flex min-w-0 flex-col gap-6"
        aria-label={isEdit ? 'Edit post' : 'New post'}
      >
        <PageHeading
          eyebrow={isEdit ? 'Edit post' : 'Write post'}
          title={isEdit ? '게시글 수정' : '게시글 작성'}
          description={
            isEdit
              ? '제목, 본문, 태그를 수정합니다. YouTube URL은 생성 후 변경하지 않습니다.'
              : 'YouTube URL과 토론 맥락을 입력하면 영상 처리는 비동기로 진행됩니다.'
          }
          badge={<Badge variant={isEdit ? 'outline' : 'info'}>{isEdit ? 'PATCH' : 'POST'}</Badge>}
        />

        <form
          className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-2 text-sm font-medium">
            Title
            <Input
              disabled={submitStatus === 'submitting'}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="영상 속 주장에 대해 토론해봅시다"
              required
              value={title}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            YouTube URL
            <Input
              disabled={submitStatus === 'submitting' || isEdit}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required={!isEdit}
              value={youtubeUrl}
            />
            {isEdit && (
              <span className="text-xs font-normal leading-5 text-muted-foreground">
                YouTube URL은 게시글 생성 이후 수정하지 않습니다.
              </span>
            )}
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Content
            <Textarea
              disabled={submitStatus === 'submitting'}
              onChange={(event) => setContent(event.target.value)}
              placeholder="토론할 맥락을 적습니다."
              required
              value={content}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Tags
            <Input
              disabled={submitStatus === 'submitting'}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="뉴스, 경제, AI"
              value={tagsInput}
            />
            <span className="text-xs font-normal leading-5 text-muted-foreground">
              쉼표로 구분해 입력합니다.
            </span>
          </label>

          {notice && <InlineNotice message={notice.message} tone={notice.tone} />}

          <div className="flex flex-wrap gap-2">
            <Button disabled={submitStatus === 'submitting'} type="submit">
              <FileText className="size-4" aria-hidden="true" />
              {submitStatus === 'submitting'
                ? isEdit
                  ? '수정 중'
                  : '작성 중'
                : isEdit
                  ? '수정 저장'
                  : '게시글 작성'}
            </Button>
            <Button
              onClick={() =>
                navigate(isEdit && postId ? `/posts/${postId}` : DEFAULT_AUTH_REDIRECT)
              }
              variant="outline"
            >
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

function AdminCommentsPlaceholder({
  navigate,
  session,
}: {
  navigate: Navigate;
  session: SessionState;
}) {
  if (session.status === 'checking') {
    return (
      <>
        <SessionChecking title="관리자 댓글 검토" />
        <PlaceholderSide
          title="Admin scope"
          items={['GET /admin/comments', 'moderation filter', 'delete action', 'analysis retry']}
        />
      </>
    );
  }

  if (session.status === 'anonymous') {
    return (
      <AuthRequired
        actionLabel="로그인하고 계속하기"
        description="관리자 댓글 검토 화면은 관리자 계정으로 로그인해야 합니다."
        navigate={navigate}
        nextPath="/admin/comments"
        title="로그인이 필요함"
      />
    );
  }

  if (session.user.role !== 'ADMIN') {
    return (
      <ForbiddenState
        description="현재 계정은 관리자 댓글 검토 화면에 접근할 수 없습니다."
        navigate={navigate}
        title="권한이 없음"
      />
    );
  }

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

function AppNotice({ message, tone }: { message: string; tone: 'destructive' }) {
  return (
    <div className="mx-auto w-[min(1240px,calc(100%-28px))] pt-4 lg:w-[min(1240px,calc(100%-48px))]">
      <p
        className={cn(
          'rounded-lg border p-3 text-sm leading-6',
          tone === 'destructive' && 'border-destructive/20 bg-destructive/5 text-destructive',
        )}
        role="alert"
      >
        {message}
      </p>
    </div>
  );
}

function InlineNotice({ message, tone }: WriteNotice) {
  return (
    <p
      className={cn(
        'rounded-md border p-3 text-sm leading-6',
        tone === 'success' && 'border-green-700/20 bg-green-50 text-green-700',
        tone === 'info' && 'border-blue-700/20 bg-blue-50 text-blue-700',
        tone === 'destructive' && 'border-destructive/20 bg-destructive/5 text-destructive',
      )}
      role={tone === 'destructive' ? 'alert' : 'status'}
    >
      {message}
    </p>
  );
}

function SessionChecking({ title }: { title: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label={`${title} session check`}>
      <PageHeading
        eyebrow="Session"
        title={title}
        description="현재 로그인 상태를 확인하는 중입니다."
        badge={<Badge variant="secondary">확인 중</Badge>}
      />
      <div className="grid max-w-xl gap-3 rounded-lg border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </section>
  );
}

function AuthRequired({
  actionLabel,
  description,
  navigate,
  nextPath,
  title,
}: {
  actionLabel: string;
  description: string;
  navigate: Navigate;
  nextPath: string;
  title: string;
}) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-5" aria-label="Login required">
        <PageHeading
          eyebrow="Unauthorized"
          title={title}
          description={description}
          badge={<Badge variant="destructive">401</Badge>}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(buildLoginPath(nextPath))}>
            <LogIn className="size-4" aria-hidden="true" />
            {actionLabel}
          </Button>
          <Button onClick={() => navigate(DEFAULT_AUTH_REDIRECT)} variant="outline">
            게시글 목록으로 이동
          </Button>
        </div>
      </section>

      <PlaceholderSide
        title="Auth required"
        items={[
          '로그인 후 access token을 memory에 저장합니다.',
          'refresh token은 httpOnly cookie로 유지합니다.',
          'write 요청 전 CSRF token을 준비합니다.',
        ]}
      />
    </>
  );
}

function ForbiddenState({
  description,
  navigate,
  title,
}: {
  description: string;
  navigate: Navigate;
  title: string;
}) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-5" aria-label="Forbidden">
        <PageHeading
          eyebrow="Forbidden"
          title={title}
          description={description}
          badge={<Badge variant="destructive">403</Badge>}
        />
        <Button className="w-fit" onClick={() => navigate(DEFAULT_AUTH_REDIRECT)} variant="outline">
          게시글 목록으로 이동
        </Button>
      </section>

      <PlaceholderSide
        title="Permission"
        items={[
          '인증은 되었지만 권한이 없습니다.',
          '관리자 기능은 ADMIN role만 사용할 수 있습니다.',
        ]}
      />
    </>
  );
}

function AuthSidePanel({ session }: { session: SessionState }) {
  const statusLabel =
    session.status === 'authenticated'
      ? { label: '로그인됨', variant: 'success' as BadgeVariant }
      : session.status === 'checking'
        ? { label: '확인 중', variant: 'secondary' as BadgeVariant }
        : { label: '비회원', variant: 'muted' as BadgeVariant };

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Auth session">
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">세션 상태</h2>
          <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
        </div>
        <StatusLine
          badge={session.status === 'authenticated' ? 'memory ready' : '없음'}
          label="Access token"
          tone={session.status === 'authenticated' ? 'success' : 'secondary'}
        />
        <StatusLine
          badge={session.status === 'authenticated' ? session.user.role : '없음'}
          label="Role"
          tone={
            session.status === 'authenticated' && session.user.role === 'ADMIN'
              ? 'warning'
              : 'secondary'
          }
        />
        <p className="text-sm leading-6 text-muted-foreground">
          refresh token과 CSRF cookie 값은 화면에 표시하지 않습니다.
        </p>
      </section>
    </aside>
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
  navigate,
  post,
  session,
  videoState,
}: {
  comments: CommentResponse[];
  navigate: Navigate;
  post: PostResponse;
  session: SessionState;
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

      <AgentPanel navigate={navigate} post={post} session={session} />

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

function AgentPanel({
  navigate,
  post,
  session,
}: {
  navigate: Navigate;
  post: PostResponse;
  session: SessionState;
}) {
  const [question, setQuestion] = useState(
    '이 게시글의 핵심 주장과 관련된 자막 근거 후보를 찾아줘.',
  );
  const [runState, setRunState] = useState<AgentPanelState>({
    status: 'idle',
    data: null,
    error: null,
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting'>('idle');
  const [notice, setNotice] = useState<WriteNotice | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [pollExpired, setPollExpired] = useState(false);
  const run = runState.data;
  const isRunning = run ? isAgentRunRunning(run.status) : false;
  const canAsk = session.status === 'authenticated';

  useEffect(() => {
    setRunState({ status: 'idle', data: null, error: null });
    setNotice(null);
    setPollStartedAt(null);
    setPollExpired(false);
  }, [post.id]);

  useEffect(() => {
    if (!run || !isAgentRunRunning(run.status)) {
      setPollStartedAt(null);
      setPollExpired(false);
      return;
    }

    if (pollStartedAt === null) {
      setPollStartedAt(Date.now());
      setPollExpired(false);
    }
  }, [pollStartedAt, run]);

  useEffect(() => {
    if (!run || !isAgentRunRunning(run.status) || pollStartedAt === null || pollExpired) {
      return;
    }

    if (document.visibilityState === 'hidden') return;

    const elapsed = Date.now() - pollStartedAt;

    if (elapsed >= 90_000) {
      setPollExpired(true);
      return;
    }

    const delay = elapsed >= 30_000 ? 3_000 : 1_000;
    const timeoutId = window.setTimeout(() => {
      refreshAgentRun(run.runId);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [pollExpired, pollStartedAt, run]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        run &&
        isAgentRunRunning(run.status) &&
        !pollExpired
      ) {
        refreshAgentRun(run.runId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pollExpired, run]);

  const refreshAgentRun = async (runId: string) => {
    setRunState((current) => ({
      status: 'loading',
      data: current.data,
      error: null,
    }));

    try {
      const data = await getAgentRun(runId);
      setRunState({ status: 'success', data, error: null });

      if (!isAgentRunRunning(data.status)) {
        setPollStartedAt(null);
        setPollExpired(false);
      }
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 401) {
        navigate(buildLoginPath(getCurrentPath()));
        return;
      }

      setRunState((current) => ({
        status: 'error',
        data: current.data,
        error: formatApiError(error),
      }));
    }
  };

  const handleSubmitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canAsk) {
      navigate(buildLoginPath(getCurrentPath()));
      return;
    }

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setNotice({ tone: 'destructive', message: 'Agent에게 보낼 질문을 입력해 주세요.' });
      return;
    }

    setSubmitStatus('submitting');
    setNotice(null);
    setRunState({ status: 'loading', data: null, error: null });

    try {
      const createdRun = await createAgentRun(post.id, { question: trimmedQuestion });
      setRunState({ status: 'success', data: createdRun, error: null });
      setPollStartedAt(Date.now());
      setPollExpired(false);
      setNotice({ tone: 'success', message: 'Agent 질문이 접수되었습니다.' });
    } catch (error: unknown) {
      handleWriteError(error, navigate, setNotice);
      setRunState({ status: 'idle', data: null, error: null });
    } finally {
      setSubmitStatus('idle');
    }
  };

  const statusLabel = run ? getAgentRunStatusLabel(run.status) : null;

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Agent 질문</h2>
        <Badge variant={statusLabel?.variant ?? 'info'}>{statusLabel?.label ?? 'ready'}</Badge>
      </div>

      <form className="grid gap-3" onSubmit={handleSubmitQuestion}>
        <label className="grid gap-2 text-sm font-medium">
          질문
          <Textarea
            disabled={!canAsk || submitStatus === 'submitting'}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="게시글과 영상 맥락에 대해 질문합니다."
            value={question}
          />
        </label>

        {notice && <InlineNotice message={notice.message} tone={notice.tone} />}

        {canAsk ? (
          <Button disabled={submitStatus === 'submitting'} type="submit">
            <Send className="size-4" aria-hidden="true" />
            {submitStatus === 'submitting' ? '질문 전송 중' : '질문 보내기'}
          </Button>
        ) : (
          <Button onClick={() => navigate(buildLoginPath(getCurrentPath()))} type="button">
            <LogIn className="size-4" aria-hidden="true" />
            로그인 후 질문
          </Button>
        )}
      </form>

      <AgentRunStatusPanel
        onRefresh={() => {
          if (run) refreshAgentRun(run.runId);
        }}
        pollExpired={pollExpired}
        runState={runState}
      />
    </section>
  );
}

function AgentRunStatusPanel({
  onRefresh,
  pollExpired,
  runState,
}: {
  onRefresh: () => void;
  pollExpired: boolean;
  runState: AgentPanelState;
}) {
  const run = runState.data;

  if (runState.status === 'idle') {
    return (
      <p className="rounded-md bg-muted p-3 text-sm leading-6 text-neutral-600">
        Agent 답변에는 근거 후보와 한계를 함께 표시합니다.
      </p>
    );
  }

  if (runState.status === 'loading' && !run) {
    return (
      <div className="grid gap-2" aria-label="Agent run loading">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 rounded-md" />
      </div>
    );
  }

  if (!run) return null;

  const statusLabel = getAgentRunStatusLabel(run.status);

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
        <Badge variant="muted">step {getAgentStepCount(run).toLocaleString()}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{getAgentRunStatusMessage(run)}</p>
      <AgentRunResultContent run={run} />
      {runState.status === 'error' && (
        <InlineNotice
          message={`Agent 상태를 불러오지 못했습니다. ${runState.error}`}
          tone="destructive"
        />
      )}
      {isAgentRunRunning(run.status) && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRefresh} size="sm" variant="outline">
            <RefreshCw className="size-4" aria-hidden="true" />
            상태 새로고침
          </Button>
        </div>
      )}
      {isAgentRunRunning(run.status) && (
        <p className="text-sm leading-6 text-muted-foreground">
          {pollExpired
            ? 'Agent run이 아직 완료되지 않았습니다. 수동으로 상태를 새로고침해 주세요.'
            : 'Agent run 상태를 자동으로 확인하는 중입니다.'}
        </p>
      )}
    </div>
  );
}

function AgentRunResultContent({ run }: { run: AgentPanelRun }) {
  if (!isAgentRunResponse(run)) {
    return (
      <p className="rounded-md bg-background p-3 text-sm leading-6 text-muted-foreground">
        Agent run 상세 결과를 기다리는 중입니다.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {run.status === 'SUCCESS' && run.answer && (
        <section className="grid gap-2 rounded-md bg-background p-3">
          <h3 className="text-sm font-semibold">답변</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800">
            {run.answer}
          </p>
        </section>
      )}

      {run.status === 'FAILED' && (
        <section className="grid gap-2 rounded-md bg-destructive/5 p-3 text-sm leading-6 text-destructive">
          <h3 className="font-semibold">실패</h3>
          <p>
            Agent 답변을 생성하지 못했습니다.
            {run.errorCode ? ` 오류 코드: ${run.errorCode}` : ''}
          </p>
        </section>
      )}

      {run.evidenceCandidates.length > 0 && (
        <AgentEvidenceCandidateList candidates={run.evidenceCandidates} />
      )}

      {run.usedTools.length > 0 && <AgentToolUseList tools={run.usedTools} />}

      {run.limitations.length > 0 && <AgentLimitations limitations={run.limitations} />}
    </div>
  );
}

function AgentToolUseList({ tools }: { tools: AgentToolUseResponse[] }) {
  return (
    <section className="grid gap-2 rounded-md bg-background p-3">
      <h3 className="text-sm font-semibold">사용한 tool</h3>
      <div className="grid gap-2">
        {tools.map((tool) => {
          const statusLabel = getAgentRunStatusLabel(tool.status);

          return (
            <div
              className="flex min-w-0 items-center justify-between gap-2 text-sm"
              key={`${tool.stepIndex}-${tool.toolName}`}
            >
              <span className="min-w-0 truncate">
                {tool.stepIndex}. {tool.toolName}
              </span>
              <Badge className="shrink-0" variant={statusLabel.variant}>
                {statusLabel.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AgentEvidenceCandidateList({
  candidates,
}: {
  candidates: AgentEvidenceCandidateResponse[];
}) {
  return (
    <section className="grid gap-2 rounded-md bg-background p-3">
      <h3 className="text-sm font-semibold">관련 있을 수 있는 자막 구간</h3>
      <div className="grid gap-2">
        {candidates.map((candidate, index) => (
          <article
            className="grid gap-2 rounded-md border border-border p-3"
            key={candidate.chunkId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">구간 {index + 1}</span>
              <Badge variant="secondary">{formatSimilarityScore(candidate.similarityScore)}</Badge>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800">
              {candidate.text}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatTranscriptTime(candidate.startSec)} - {formatTranscriptTime(candidate.endSec)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentLimitations({ limitations }: { limitations: string[] }) {
  return (
    <section className="grid gap-2 rounded-md border border-blue-700/20 bg-blue-50 p-3 text-blue-700">
      <h3 className="text-sm font-semibold">한계</h3>
      <ul className="grid gap-1 text-sm leading-6">
        {limitations.map((limitation) => (
          <li className="break-words" key={limitation}>
            {limitation}
          </li>
        ))}
      </ul>
    </section>
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

function buildLoginPath(nextPath: string) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

function getSafeNextPath(search: string) {
  const params = new URLSearchParams(search);
  const next = params.get('next');

  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return DEFAULT_AUTH_REDIRECT;
  }

  try {
    const url = new URL(next, window.location.origin);

    if (url.origin !== window.location.origin) {
      return DEFAULT_AUTH_REDIRECT;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}

function getPostRouteNotice(search: string): WriteNotice | null {
  const params = new URLSearchParams(search);

  if (params.get('created') === '1') {
    return {
      tone: 'success',
      message: '게시글이 생성되었습니다. 영상 처리는 잠시 걸릴 수 있습니다.',
    };
  }

  if (params.get('updated') === '1') {
    return {
      tone: 'success',
      message: '게시글이 수정되었습니다.',
    };
  }

  return null;
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

function handleWriteError(
  error: unknown,
  navigate: Navigate,
  setNotice: (notice: WriteNotice) => void,
) {
  if (error instanceof ApiRequestError && error.status === 401) {
    navigate(buildLoginPath(getCurrentPath()));
    return;
  }

  if (error instanceof ApiRequestError && error.status === 403) {
    setNotice({
      tone: 'destructive',
      message: '권한이 없거나 CSRF token이 만료되었습니다. 다시 시도해 주세요.',
    });
    return;
  }

  setNotice({ tone: 'destructive', message: formatApiError(error) });
}

function parseTagsInput(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function canShowEvidenceAction(comment: CommentResponse) {
  return comment.analysis?.commentType === 'FACT_CLAIM';
}

function getEvidenceActionLabel(comment: CommentResponse) {
  const analysis = comment.analysis;

  if (!analysis) return '근거 후보';

  if (analysis.evidenceCount > 0) {
    return `근거 후보 ${analysis.evidenceCount.toLocaleString()}개`;
  }

  if (analysis.ragStatus === 'NO_RESULT') {
    return '관련 구간 없음';
  }

  if (analysis.ragStatus === 'FAILED') {
    return '근거 후보 실패';
  }

  return '근거 후보 상태';
}

function getSummaryActionLabel(
  summary: SummaryResponse | null | undefined,
  requestStatus: 'idle' | 'submitting',
) {
  if (requestStatus === 'submitting') return '요약 요청 중';
  if (summary?.status === 'FAILED') return '요약 다시 요청';
  if (summary?.isStale) return '요약 갱신';
  if (summary?.status === 'SUCCESS') return '요약 다시 확인';
  if (summary && isSummaryRunning(summary.status)) return '요약 진행 중';
  return '댓글 스레드 요약';
}

function getSessionRestoreMessage(error: unknown) {
  if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
    return null;
  }

  return formatApiError(error);
}

function isAuthExpiredError(error: unknown) {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
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

function formatSimilarityScore(value: number) {
  if (!Number.isFinite(value)) return '유사도 -';
  return `유사도 ${Math.round(value * 100)}%`;
}

function formatTranscriptTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((value - totalSeconds) * 10);
  const secondText = seconds.toString().padStart(2, '0');

  return tenths > 0 ? `${minutes}:${secondText}.${tenths}` : `${minutes}:${secondText}`;
}

function countComments(comments: CommentResponse[]) {
  return comments.reduce((total, comment) => total + 1 + (comment.replies?.length ?? 0), 0);
}

function countSummarizableThreadComments(comment: CommentResponse) {
  const rootCount = isCommentDeleted(comment) ? 0 : 1;
  const replyCount = (comment.replies ?? []).filter((reply) => !isCommentDeleted(reply)).length;

  return rootCount + replyCount;
}

function getCommentThreadRevision(comment: CommentResponse) {
  return [comment.updatedAt, ...(comment.replies ?? []).map((reply) => reply.updatedAt)].join('|');
}

function isCommentDeleted(comment: CommentResponse) {
  return comment.isDeleted || comment.moderationStatus === 'DELETED_BY_ADMIN';
}

function isSummaryRunning(status: SummaryStatus) {
  return status === 'PENDING' || status === 'PROCESSING';
}

function isAgentRunRunning(status: AgentRunStatus) {
  return status === 'PENDING' || status === 'RUNNING';
}

function isAgentRunResponse(run: AgentPanelRun): run is AgentRunResponse {
  return 'usedTools' in run;
}

function getAgentStepCount(run: AgentPanelRun) {
  return 'stepCount' in run ? run.stepCount : 0;
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

function getSummaryStatusLabel(status: SummaryStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: '생성 대기', variant: 'secondary' };
    case 'PROCESSING':
      return { label: '요약 중', variant: 'secondary' };
    case 'SUCCESS':
      return { label: '요약 완료', variant: 'success' };
    case 'FAILED':
      return { label: '요약 실패', variant: 'destructive' };
  }
}

function getAgentRunStatusLabel(status: AgentRunStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case 'PENDING':
      return { label: '질문 접수', variant: 'secondary' };
    case 'RUNNING':
      return { label: '근거 후보 확인 중', variant: 'secondary' };
    case 'SUCCESS':
      return { label: '답변 완료', variant: 'success' };
    case 'FAILED':
      return { label: '답변 실패', variant: 'destructive' };
  }
}

function getAgentRunStatusMessage(run: AgentPanelRun) {
  switch (run.status) {
    case 'PENDING':
      return 'Agent 질문이 접수되었습니다.';
    case 'RUNNING':
      return 'Agent가 게시글 맥락과 근거 후보를 확인하는 중입니다.';
    case 'SUCCESS':
      return 'Agent 답변이 준비되었습니다.';
    case 'FAILED':
      return 'Agent 답변을 생성하지 못했습니다.';
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
