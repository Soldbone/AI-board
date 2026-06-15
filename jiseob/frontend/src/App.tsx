import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Eye,
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
} from 'lucide-react';
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

const tagFilters = ['전체', '뉴스', '경제', '과학', '정책'];

const posts = [
  {
    id: '2024-stats',
    title: '영상 속 2024년 통계 해석에 대해 토론해봅시다',
    preview:
      '영상에서 언급된 수치가 어떤 맥락에서 나온 것인지 댓글로 구간과 해석을 함께 확인합니다.',
    author: '토론러',
    tags: ['뉴스', '경제'],
    comments: 18,
    views: 124,
    likes: 9,
    createdAt: '방금 전',
    videoStatus: '영상 준비됨',
    statusTone: 'success' as const,
  },
  {
    id: 'transcript-policy',
    title: '자막이 없는 영상도 게시글 작성은 성공해야 하나요?',
    preview: '영상 처리는 비동기 상태로 남기고 토론 생성 자체는 실패시키지 않는 정책을 확인합니다.',
    author: 'arena-user',
    tags: ['제품', '정책'],
    comments: 5,
    views: 57,
    likes: 3,
    createdAt: '12분 전',
    videoStatus: '자막 처리 중',
    statusTone: 'warning' as const,
  },
  {
    id: 'science-claim',
    title: '과학 영상의 실험 조건 설명이 댓글에서 누락되고 있습니다',
    preview:
      '실험 결과만 인용하기보다 조건과 한계를 함께 읽을 수 있도록 근거 후보 흐름을 정리합니다.',
    author: 'researcher',
    tags: ['과학'],
    comments: 11,
    views: 88,
    likes: 6,
    createdAt: '1시간 전',
    videoStatus: '임베딩 대기 중',
    statusTone: 'secondary' as const,
  },
];

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

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath: string) => {
    if (window.location.pathname === nextPath) return;
    window.history.pushState(null, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0 });
  };

  return { route: parseRoute(path), navigate };
}

export default function App() {
  const { route, navigate } = useRoute();

  return (
    <div className="min-h-svh bg-background text-foreground">
      <TopNav navigate={navigate} route={route} />
      <main className="mx-auto grid w-[min(1240px,calc(100%-28px))] grid-cols-1 gap-6 py-6 lg:w-[min(1240px,calc(100%-48px))] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:py-8">
        {renderRoute(route, navigate)}
      </main>
    </div>
  );
}

function renderRoute(route: Route, navigate: Navigate) {
  switch (route.name) {
    case 'posts':
      return <PostsIndex navigate={navigate} />;
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
          className="flex min-w-fit items-center gap-2 text-left font-semibold"
          onClick={() => navigate('/')}
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

function PostsIndex({ navigate }: { navigate: Navigate }) {
  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="Post list">
        <PageHeading
          eyebrow="Discussion board"
          title="게시글 목록"
          description="최신 토론, 태그, 영상 처리 상태를 먼저 확인합니다."
          badge={<Badge variant="info">Harness 1</Badge>}
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input className="pl-9" placeholder="검색어 placeholder" readOnly />
          </div>
          <Button variant="outline">검색</Button>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Tag filters">
          {tagFilters.map((tag, index) => (
            <Button key={tag} variant={index === 0 ? 'default' : 'outline'} size="sm">
              {tag}
            </Button>
          ))}
        </div>

        <div className="grid gap-3">
          {posts.map((post) => (
            <article
              className="grid gap-4 rounded-lg border border-border bg-card p-4 transition hover:border-neutral-300 hover:bg-neutral-50 sm:p-5"
              key={post.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button
                  className="min-w-0 text-left"
                  onClick={() => navigate(`/posts/${post.id}`)}
                  type="button"
                >
                  <h2 className="text-base font-semibold leading-snug sm:text-[17px]">
                    {post.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
                    {post.preview}
                  </p>
                </button>
                <Badge className="w-fit shrink-0" variant={post.statusTone}>
                  {post.videoStatus}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                <span>{post.author}</span>
                <span>{post.createdAt}</span>
                <Metric icon={MessageCircle} label={`댓글 ${post.comments}`} />
                <Metric icon={Eye} label={`조회 ${post.views}`} />
                <Metric icon={Heart} label={`좋아요 ${post.likes}`} />
                <span>{post.tags.map((tag) => `#${tag}`).join(' ')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <BoardSidePanel />
    </>
  );
}

function PostDetail({ navigate, postId }: { navigate: Navigate; postId: string }) {
  const post = useMemo(() => posts.find((item) => item.id === postId) ?? posts[0], [postId]);

  return (
    <>
      <section className="flex min-w-0 flex-col gap-6" aria-label="Post detail">
        <Button className="w-fit" onClick={() => navigate('/')} variant="ghost" size="sm">
          <ArrowLeft className="size-4" aria-hidden="true" />
          목록
        </Button>

        <PageHeading
          eyebrow="Post detail"
          title={post.title}
          description={`${post.author} · ${post.createdAt} · ${post.tags.map((tag) => `#${tag}`).join(' ')}`}
          badge={<Badge variant={post.statusTone}>{post.videoStatus}</Badge>}
        />

        <section
          className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
          aria-label="Video preview"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">영상과 토론 본문</p>
              <p className="mt-1 text-sm text-muted-foreground">
                실제 영상 연결은 Harness 4에서 처리합니다.
              </p>
            </div>
            <Badge variant="success">metadata 준비됨</Badge>
          </div>
          <div className="grid aspect-video place-items-center rounded-lg border border-border bg-[linear-gradient(135deg,rgba(0,0,0,0.78),rgba(30,41,59,0.86))] text-white">
            <span className="grid size-16 place-items-center rounded-full border border-white/30 bg-white/10">
              <Play className="ml-1 size-7 fill-white" aria-hidden="true" />
            </span>
          </div>
          <p className="text-sm leading-6 text-neutral-700">
            이 화면에서는 영상 카드, 게시글 본문, 댓글 thread가 하나의 읽기 흐름으로 이어집니다. AI
            보조 정보는 오른쪽 panel과 이후 sheet에서 확인합니다.
          </p>
        </section>

        <section
          className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:p-5"
          aria-label="Comments"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">댓글 thread</p>
              <p className="mt-1 text-sm text-muted-foreground">읽기 전용 placeholder</p>
            </div>
            <Button variant="outline" disabled>
              댓글 작성
            </Button>
          </div>
          <CommentPreview />
        </section>
      </section>

      <DetailSidePanel />
    </>
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
            <Button onClick={() => navigate('/')} variant="outline">
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

function BoardSidePanel() {
  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Board side panel">
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">영상 처리 상태</h2>
          <Badge variant="warning">진행 중</Badge>
        </div>
        <StatusLine label="Metadata" badge="준비됨" tone="success" />
        <StatusLine label="Transcript" badge="처리 중" tone="warning" />
        <StatusLine label="Embedding" badge="대기 중" tone="secondary" />
      </section>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">목록 상태</h2>
          <Badge variant="muted">static</Badge>
        </div>
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <p className="text-sm leading-6 text-muted-foreground">
          loading, empty, error state는 Harness 3에서 실제 API 상태와 연결합니다.
        </p>
      </section>
    </aside>
  );
}

function DetailSidePanel() {
  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Detail side panel">
      <BoardSidePanel />

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
          <h2 className="text-base font-semibold">근거 후보 sheet</h2>
          <Badge variant="success">3개</Badge>
        </div>
        <div className="grid gap-3 rounded-md border border-border bg-neutral-50 p-3">
          <p className="text-xs text-muted-foreground">00:12 - 00:20 · similarity 0.84</p>
          <p className="text-sm leading-6">영상에서 수치 증가를 설명하는 자막 구간입니다.</p>
        </div>
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

function CommentPreview() {
  return (
    <div className="grid gap-3">
      <article className="grid gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
              토
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">토론러</h3>
              <p className="text-xs text-muted-foreground">방금 전</p>
            </div>
          </div>
          <Badge className="w-fit" variant="info">
            사실 주장
          </Badge>
        </div>
        <p className="text-sm leading-6">
          영상에서는 2024년에 수치가 증가했다고 말하는데, 정확히 어느 구간에서 나오는지 같이 보면
          좋겠습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">근거 후보 3개</Badge>
          <Button variant="outline" size="sm" disabled>
            근거 후보 보기
          </Button>
          <Button variant="outline" size="sm" disabled>
            답글
          </Button>
        </div>
      </article>

      <article className="ml-0 grid gap-3 rounded-lg border border-border bg-neutral-50 p-4 sm:ml-7">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
            A
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">arena-user</h3>
            <p className="text-xs text-muted-foreground">1분 전</p>
          </div>
        </div>
        <p className="text-sm leading-6">
          00:12 근처에서 언급되는 듯합니다. 다만 영상 전체 맥락도 같이 봐야 할 것 같습니다.
        </p>
      </article>
    </div>
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

function Metric({ icon: Icon, label }: { icon: typeof MessageCircle; label: string }) {
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
        <Button className="w-fit" onClick={() => navigate('/')}>
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
