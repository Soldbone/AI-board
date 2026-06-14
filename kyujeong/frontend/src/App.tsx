import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type PostListItem = {
  id: number
  title: string
  createdAt: string
  author: {
    id: number
    nickname: string
  }
  tags?: string[]
  commentsCount?: number
  hasAiRecommendation?: boolean
  aiRecommendationStatus?: AiRecommendationStatus | null
}

type PostListResponse = {
  items: PostListItem[]
  total: number
  page: number
  size: number
  totalPages: number
}

type PostDetailItem = {
  id: number
  title: string
  content: string
  viewCount: number
  createdAt: string
  updatedAt: string
  author: {
    id: number
    nickname: string
  }
  tags?: string[]
}

type CommentItem = {
  id: number
  content: string
  postId: number
  createdAt: string
  updatedAt: string
  author: {
    id: number
    nickname: string
  }
}

type AiReferencedPost = {
  postId: number
  title: string
  tags: string[]
  similarity: number
  rank: number
}

type AiRecommendationStatus = 'ACTIVE' | 'STALE'
type AiRecommendationGrounding = 'COMMUNITY_RAG' | 'GENERAL_AI'
type AiRecommendationGoal =
  | 'BALANCED'
  | 'HIGH_PROTEIN'
  | 'LIGHT'
  | 'LOW_SODIUM'
  | 'FILLING'
  | 'POST_WORKOUT'

type AppView =
  | 'board'
  | 'login'
  | 'signup'
  | 'forgotPassword'
  | 'write'
  | 'mypage'
  | 'tags'
  | 'aiGuide'
  | 'mcpCheck'
  | 'notifications'
  | 'searchResults'

type AppHistoryState = {
  appView: AppView | 'post'
  postId?: number
}

type AiRecommendation = {
  id: number
  postId: number | null
  menuName: string
  reason: string
  availableIngredients: string[]
  missingIngredients: string[]
  estimatedCookingTime: number | null
  difficulty: string
  content: string
  status: AiRecommendationStatus
  grounding: AiRecommendationGrounding
  createdAt: string
  referencedPosts: AiReferencedPost[]
}

type MyAiRecommendation = AiRecommendation & {
  post: {
    id: number
    title: string
  } | null
}

type AiServiceStatus = {
  mode: 'OPENAI' | 'FALLBACK'
  openAiConfigured: boolean
  embeddingModel: string
  chatModel: string | null
  dailyLimit: number | null
  pgvectorAvailable: boolean
  pgvectorInstalled: boolean
  pgvectorDecision: string
}

type MatchStatus =
  | 'matched'
  | 'candidate'
  | 'not_found'
  | 'configuration_missing'
  | 'rate_limited'
  | 'api_error'

type NutritionFacts = {
  energyKcal: number | null
  carbohydrateG: number | null
  proteinG: number | null
  fatG: number | null
  sugarG: number | null
  sodiumMg: number | null
}

type IngredientNutritionSummary = {
  originalInput: string
  normalizedInput: string
  matchedName: string | null
  servingSize: string | null
  nutrition: NutritionFacts
  matchStatus: MatchStatus
  message: string | null
}

type IngredientSetAnalysis = {
  originalInputs: string[]
  normalizedInputs: string[]
  ingredients: IngredientNutritionSummary[]
  totals: NutritionFacts
  perIngredientAverage: NutritionFacts
  dataSource: string
  matchStatus: MatchStatus
  notes: string[]
}

type PostDraftAgentStatus = 'needs_input' | 'completed' | 'fallback'

type PostDraftAgentStep = {
  index: number
  node: string
  toolName?: string
  status: 'started' | 'completed' | 'skipped' | 'failed'
  message: string
}

type PostDraftToolCall = {
  toolName: string
  status: 'completed' | 'failed' | 'skipped'
  inputSummary: string
  outputSummary: string
}

type PostDraftAgentResponse = {
  status: PostDraftAgentStatus
  message: string
  questions: string[]
  suggestedTitle: string | null
  suggestedBody: string | null
  suggestedTags: string[]
  ingredients: string[]
  nutritionSummary: string | null
  nutritionAnalysis: IngredientSetAnalysis | null
  steps: PostDraftAgentStep[]
  toolCalls: PostDraftToolCall[]
  errors: string[]
}

type MyCommentItem = CommentItem & {
  post: {
    id: number
    title: string
  }
}

type LoginUser = {
  id: number
  email: string
  nickname: string
  createdAt: string
}

type LoginResponse = {
  accessToken: string
  user: LoginUser
}

type BoardPost = {
  id: number
  title: string
  tags: string[]
  authorId: number
  author: string
  comments: number
  aiStatus: '완료' | '대기중' | '다시 추천'
  createdAt: string
}

const categories = ['전체', '계란', '김치', '간단요리', '자취요리', '국물요리', '10분요리']

const pageSize = 10

const tagFilterGroups = [
  '전체',
  'ㄱ',
  'ㄴ',
  'ㄷ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅅ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
  'A-Z',
]

const aiRecommendationSteps = [
  '재료와 상황 확인',
  '유사한 요리 흐름 탐색',
  '영양 목표 반영',
  '냉장고 조합 정리',
  '추천 결과 구성',
]

const aiRecommendationGoalOptions: Array<{
  id: AiRecommendationGoal
  label: string
  description: string
}> = [
  {
    id: 'BALANCED',
    label: '기본',
    description: '재료와 상황을 균형 있게 반영',
  },
  {
    id: 'HIGH_PROTEIN',
    label: '고단백',
    description: '단백질 재료를 더 적극 활용',
  },
  {
    id: 'LIGHT',
    label: '가볍게',
    description: '기름과 밥/면 비중을 낮춤',
  },
  {
    id: 'LOW_SODIUM',
    label: '나트륨 낮게',
    description: '짠 재료와 양념을 조절',
  },
  {
    id: 'FILLING',
    label: '든든하게',
    description: '한 끼 포만감을 우선',
  },
  {
    id: 'POST_WORKOUT',
    label: '운동 후',
    description: '단백질과 탄수화물 균형',
  },
]

const appViewPaths: Record<AppView, string> = {
  board: '/',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  write: '/write',
  mypage: '/mypage',
  tags: '/tags',
  aiGuide: '/ai-recommendations',
  mcpCheck: '/mcp-check',
  notifications: '/notifications',
  searchResults: '/search',
}

const pathToAppView = new Map(
  Object.entries(appViewPaths).map(([view, path]) => [path, view as AppView]),
)

function getPostDetailPath(postId: number) {
  return `/posts/${postId}`
}

function getPostIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/posts\/(\d+)\/?$/)
  const postId = match ? Number(match[1]) : null

  return typeof postId === 'number' && Number.isInteger(postId) && postId > 0
    ? postId
    : null
}

function getAppRouteFromPath(pathname = window.location.pathname): AppHistoryState {
  const postId = getPostIdFromPath(pathname)

  if (postId) {
    return {
      appView: 'post',
      postId,
    }
  }

  return {
    appView: pathToAppView.get(pathname.replace(/\/$/, '') || '/') ?? 'board',
  }
}

function getAppRoutePath(state: AppHistoryState) {
  return state.appView === 'post' && state.postId
    ? getPostDetailPath(state.postId)
    : appViewPaths[state.appView === 'post' ? 'board' : state.appView]
}

function updateBrowserHistory(
  state: AppHistoryState,
  mode: 'push' | 'replace',
) {
  const url = getAppRoutePath(state)

  if (
    window.location.pathname === url &&
    window.history.state?.appView === state.appView &&
    window.history.state?.postId === state.postId
  ) {
    return
  }

  if (mode === 'replace') {
    window.history.replaceState(state, '', url)
    return
  }

  window.history.pushState(state, '', url)
}

const koreanInitials = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
]

function getSavedAccessToken() {
  return (
    localStorage.getItem('accessToken') ??
    sessionStorage.getItem('accessToken') ??
    ''
  )
}

function getSavedUser() {
  const savedUser =
    localStorage.getItem('currentUser') ?? sessionStorage.getItem('currentUser')

  if (!savedUser) {
    return null
  }

  try {
    return JSON.parse(savedUser) as LoginUser
  } catch {
    localStorage.removeItem('currentUser')
    return null
  }
}

function saveAuthSession(
  accessToken: string,
  user: LoginUser,
  shouldRemember: boolean,
) {
  const storage = shouldRemember ? localStorage : sessionStorage
  const otherStorage = shouldRemember ? sessionStorage : localStorage

  storage.setItem('accessToken', accessToken)
  storage.setItem('currentUser', JSON.stringify(user))
  otherStorage.removeItem('accessToken')
  otherStorage.removeItem('currentUser')
}

function clearAuthSession() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('currentUser')
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('currentUser')
}

function updateSavedUser(user: LoginUser) {
  const storage = localStorage.getItem('accessToken')
    ? localStorage
    : sessionStorage

  storage.setItem('currentUser', JSON.stringify(user))
}

async function readJsonResponse<T>(response: Response) {
  const text = await response.text()

  if (!text.trim()) {
    return {} as T & { message?: string }
  }

  try {
    return JSON.parse(text) as T & { message?: string }
  } catch {
    if (!response.ok) {
      return { message: text } as T & { message?: string }
    }

    throw new Error('서버 응답을 읽지 못했습니다.')
  }
}

function isAiRecommendation(value: unknown): value is AiRecommendation {
  if (!value || typeof value !== 'object') {
    return false
  }

  const recommendation = value as Partial<AiRecommendation>

  return (
    typeof recommendation.menuName === 'string' &&
    typeof recommendation.reason === 'string' &&
    Array.isArray(recommendation.missingIngredients) &&
    typeof recommendation.grounding === 'string' &&
    Array.isArray(recommendation.referencedPosts)
  )
}

async function fetchMyPostItems(accessToken: string) {
  const response = await fetch('/api/users/me/posts', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await readJsonResponse<PostListItem[]>(response)

  if (!response.ok) {
    throw new Error(data.message ?? '내가 작성한 글을 불러오지 못했습니다.')
  }

  return data.map(mapPostListItem)
}

async function fetchMyCommentItems(accessToken: string) {
  const response = await fetch('/api/users/me/comments', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await readJsonResponse<MyCommentItem[]>(response)

  if (!response.ok) {
    throw new Error(data.message ?? '내가 작성한 댓글을 불러오지 못했습니다.')
  }

  return data
}

async function fetchMyAiRecommendationItems(accessToken: string) {
  const response = await fetch('/api/users/me/ai-recommendations', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await readJsonResponse<MyAiRecommendation[]>(response)

  if (!response.ok) {
    throw new Error(data.message ?? 'AI 추천 기록을 불러오지 못했습니다.')
  }

  return data
}

function getFriendlyErrorMessage(message: string, fallback: string) {
  const messages: Record<string, string> = {
    'Email already exists': '이미 가입된 이메일입니다.',
    'Invalid email or password': '이메일 또는 비밀번호를 확인해주세요.',
    'Invalid token': '로그인이 만료되었습니다. 다시 로그인해주세요.',
    'User not found': '사용자 정보를 찾지 못했습니다.',
    'Post not found': '게시글을 찾지 못했습니다.',
    'Comment not found': '댓글을 찾지 못했습니다.',
    'You can only update your own post': '내가 작성한 글만 수정할 수 있습니다.',
    'You can only delete your own post': '내가 작성한 글만 삭제할 수 있습니다.',
    'You can only update your own comment': '내가 작성한 댓글만 수정할 수 있습니다.',
    'You can only delete your own comment': '내가 작성한 댓글만 삭제할 수 있습니다.',
    'Tags can be up to 5': '태그는 최대 5개까지 입력할 수 있습니다.',
    'Tag name can be up to 20 characters':
      '태그 이름은 최대 20자까지 입력할 수 있습니다.',
  }

  return messages[message] ?? message ?? fallback
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isExpiredSessionMessage(message: string) {
  return message === 'Invalid token'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(value))
    .replace(/\. /g, '.')
    .replace(/\.$/, '')
}

function getAiRecommendationStatusLabel(
  status?: AiRecommendationStatus | null,
): BoardPost['aiStatus'] {
  if (status === 'ACTIVE') {
    return '완료'
  }

  if (status === 'STALE') {
    return '다시 추천'
  }

  return '대기중'
}

function getAiRecommendationStatusClass(status: BoardPost['aiStatus']) {
  if (status === '완료') {
    return 'done'
  }

  if (status === '다시 추천') {
    return 'stale'
  }

  return 'pending'
}

function getAiGroundingLabel(grounding?: AiRecommendationGrounding) {
  return grounding === 'GENERAL_AI' ? '일반 AI 지식' : '커뮤니티 참고'
}

function getAiGroundingMessage(grounding?: AiRecommendationGrounding) {
  return grounding === 'GENERAL_AI'
    ? '아직 참고할 게시글이 부족해 현재 내용과 일반 요리 지식을 기준으로 추천했어요.'
    : '비슷한 커뮤니티 게시글을 참고해 추천했어요.'
}

function getAiRecommendationGoalLabel(goal: AiRecommendationGoal) {
  return (
    aiRecommendationGoalOptions.find((option) => option.id === goal)?.label ??
    '기본'
  )
}

function formatNutritionValue(value: number | null, unit: string) {
  return typeof value === 'number' ? `${value.toLocaleString('ko-KR')}${unit}` : '확인 불가'
}

function getIngredientMatchLabel(status: MatchStatus) {
  const labels: Record<MatchStatus, string> = {
    matched: '일치',
    candidate: '후보',
    not_found: '결과 없음',
    configuration_missing: '키 필요',
    rate_limited: '호출 제한',
    api_error: '조회 오류',
  }

  return labels[status]
}

function getPostDraftAgentStatusLabel(status: PostDraftAgentStatus) {
  const labels: Record<PostDraftAgentStatus, string> = {
    needs_input: '추가 정보 필요',
    completed: 'AI 초안 완료',
    fallback: '기본 초안 완료',
  }

  return labels[status]
}

function getTagGroup(tagName: string) {
  const firstLetter = tagName.trim().charAt(0)
  const code = firstLetter.charCodeAt(0)

  if (code >= 0xac00 && code <= 0xd7a3) {
    const initialIndex = Math.floor((code - 0xac00) / 588)
    const initial = koreanInitials[initialIndex]

    if (initial === 'ㄲ') {
      return 'ㄱ'
    }

    if (initial === 'ㄸ') {
      return 'ㄷ'
    }

    if (initial === 'ㅃ') {
      return 'ㅂ'
    }

    if (initial === 'ㅆ') {
      return 'ㅅ'
    }

    if (initial === 'ㅉ') {
      return 'ㅈ'
    }

    return initial
  }

  if (/^[a-z]/i.test(firstLetter)) {
    return 'A-Z'
  }

  return '전체'
}

function mapPostListItem(post: PostListItem): BoardPost {
  return {
    id: post.id,
    title: post.title,
    tags: post.tags ?? [],
    authorId: post.author.id,
    author: post.author.nickname,
    comments: post.commentsCount ?? 0,
    aiStatus: getAiRecommendationStatusLabel(post.aiRecommendationStatus),
    createdAt: formatDate(post.createdAt),
  }
}

function App() {
  const initialRoute = useMemo(() => getAppRouteFromPath(), [])
  const isApplyingHistoryRef = useRef(false)
  const [currentView, setCurrentView] = useState<AppView>(
    initialRoute.appView === 'post' ? 'board' : initialRoute.appView,
  )
  const [accessToken, setAccessToken] = useState(getSavedAccessToken)
  const [currentUser, setCurrentUser] = useState<LoginUser | null>(getSavedUser)
  const [activeCategory, setActiveCategory] = useState('전체')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [postTotal, setPostTotal] = useState(0)
  const [postListReloadKey, setPostListReloadKey] = useState(0)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedPost, setSelectedPost] = useState<PostDetailItem | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailErrorMessage, setDetailErrorMessage] = useState('')
  const [commentContent, setCommentContent] = useState('')
  const [commentErrorMessage, setCommentErrorMessage] = useState('')
  const [commentSubmitMessage, setCommentSubmitMessage] = useState('')
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')
  const [isCommentUpdating, setIsCommentUpdating] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null)
  const [postDeleteErrorMessage, setPostDeleteErrorMessage] = useState('')
  const [isPostDeleting, setIsPostDeleting] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginErrorMessage, setLoginErrorMessage] = useState('')
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false)
  const [shouldRememberLogin, setShouldRememberLogin] = useState(true)
  const [isLoginPasswordVisible, setIsLoginPasswordVisible] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('')
  const [signupNickname, setSignupNickname] = useState('')
  const [signupErrorMessage, setSignupErrorMessage] = useState('')
  const [signupSubmitMessage, setSignupSubmitMessage] = useState('')
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false)
  const [isSignupPasswordVisible, setIsSignupPasswordVisible] = useState(false)
  const [isSignupConfirmVisible, setIsSignupConfirmVisible] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitMessage, setForgotSubmitMessage] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [postContent, setPostContent] = useState('')
  const [postTagInput, setPostTagInput] = useState('')
  const [postDraftAdditionalRequest, setPostDraftAdditionalRequest] =
    useState('')
  const [postDraftAgentResult, setPostDraftAgentResult] =
    useState<PostDraftAgentResponse | null>(null)
  const [postDraftAgentErrorMessage, setPostDraftAgentErrorMessage] =
    useState('')
  const [isPostDraftAgentLoading, setIsPostDraftAgentLoading] = useState(false)
  const [editingPostId, setEditingPostId] = useState<number | null>(null)
  const [postCreateErrorMessage, setPostCreateErrorMessage] = useState('')
  const [isPostCreating, setIsPostCreating] = useState(false)
  const [me, setMe] = useState<LoginUser | null>(currentUser)
  const [isMeLoading, setIsMeLoading] = useState(false)
  const [meErrorMessage, setMeErrorMessage] = useState('')
  const [myPageSection, setMyPageSection] = useState<
    'info' | 'posts' | 'comments' | 'aiHistory' | 'likes' | 'settings'
  >('info')
  const [myPosts, setMyPosts] = useState<BoardPost[]>([])
  const [isMyPostsLoading, setIsMyPostsLoading] = useState(false)
  const [myPostsErrorMessage, setMyPostsErrorMessage] = useState('')
  const [myComments, setMyComments] = useState<MyCommentItem[]>([])
  const [isMyCommentsLoading, setIsMyCommentsLoading] = useState(false)
  const [myCommentsErrorMessage, setMyCommentsErrorMessage] = useState('')
  const [myAiRecommendations, setMyAiRecommendations] = useState<
    MyAiRecommendation[]
  >([])
  const [isMyAiRecommendationsLoading, setIsMyAiRecommendationsLoading] =
    useState(false)
  const [myAiRecommendationsErrorMessage, setMyAiRecommendationsErrorMessage] =
    useState('')
  const [tagItems, setTagItems] = useState<Array<[string, number]>>([])
  const [activeTagGroup, setActiveTagGroup] = useState('전체')
  const [isTagsLoading, setIsTagsLoading] = useState(false)
  const [tagErrorMessage, setTagErrorMessage] = useState('')
  const [aiModalState, setAiModalState] = useState<
    'closed' | 'running' | 'result'
  >('closed')
  const [aiProgress, setAiProgress] = useState(0)
  const [aiRecommendation, setAiRecommendation] =
    useState<AiRecommendation | null>(null)
  const [aiRecommendationErrorMessage, setAiRecommendationErrorMessage] =
    useState('')
  const [isAiRecommendationLoading, setIsAiRecommendationLoading] =
    useState(false)
  const [postAiRecommendationGoal, setPostAiRecommendationGoal] =
    useState<AiRecommendationGoal>('BALANCED')
  const [postAiAdditionalRequest, setPostAiAdditionalRequest] = useState('')
  const [directAiIngredientInput, setDirectAiIngredientInput] = useState('')
  const [directAiConditionInput, setDirectAiConditionInput] = useState('')
  const [directAiRecommendationGoal, setDirectAiRecommendationGoal] =
    useState<AiRecommendationGoal>('BALANCED')
  const [directAiRecommendation, setDirectAiRecommendation] =
    useState<AiRecommendation | null>(null)
  const [directAiErrorMessage, setDirectAiErrorMessage] = useState('')
  const [isDirectAiSubmitting, setIsDirectAiSubmitting] = useState(false)
  const [ingredientMetadata, setIngredientMetadata] =
    useState<IngredientSetAnalysis | null>(null)
  const [ingredientMetadataErrorMessage, setIngredientMetadataErrorMessage] =
    useState('')
  const [isIngredientMetadataLoading, setIsIngredientMetadataLoading] =
    useState(false)
  const [mcpIngredientInput, setMcpIngredientInput] = useState('계란, 두부')
  const [mcpMetadata, setMcpMetadata] = useState<IngredientSetAnalysis | null>(
    null,
  )
  const [mcpMetadataErrorMessage, setMcpMetadataErrorMessage] = useState('')
  const [isMcpMetadataLoading, setIsMcpMetadataLoading] = useState(false)
  const [aiServiceStatus, setAiServiceStatus] =
    useState<AiServiceStatus | null>(null)
  const [aiStatusErrorMessage, setAiStatusErrorMessage] = useState('')

  const popularTagItems = useMemo(() => {
    const tagCounts = new Map<string, number>()

    posts.forEach((post) => {
      post.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      })
    })

    return Array.from(tagCounts.entries())
      .sort((firstTag, secondTag) => secondTag[1] - firstTag[1])
      .slice(0, 5)
  }, [posts])

  const recentActivityItems = useMemo(
    () =>
      posts.slice(0, 3).map((post) => ({
        id: post.id,
        title: `${post.author}님이 새 글을 작성했어요`,
        detail: post.title,
        time: post.createdAt,
      })),
    [posts],
  )
  const filteredTagItems = useMemo(() => {
    if (activeTagGroup === '전체') {
      return tagItems
    }

    return tagItems.filter(([tag]) => getTagGroup(tag) === activeTagGroup)
  }, [activeTagGroup, tagItems])
  const topTagItems = (tagItems.length > 0 ? tagItems : popularTagItems).slice(
    0,
    8,
  )
  const aiTargetTitle = selectedPost?.title ?? '냉장고 재료 고민'
  const recentMyPosts = myPosts.slice(0, 3)
  const recentMyComments = myComments.slice(0, 2)
  const hasMyActivity =
    recentMyPosts.length > 0 || recentMyComments.length > 0
  const isAuthView =
    currentView === 'login' ||
    currentView === 'signup' ||
    currentView === 'forgotPassword'

  function getDirectAiIngredients() {
    return parseIngredientInput(directAiIngredientInput)
  }

  function getMcpIngredients() {
    return parseIngredientInput(mcpIngredientInput)
  }

  function parseIngredientInput(value: string) {
    return value
      .split(',')
      .map((ingredient) => ingredient.trim())
      .filter(Boolean)
  }

  function syncPostAiRecommendationStatus(
    postId: number,
    status: AiRecommendationStatus | null,
  ) {
    const aiStatus = getAiRecommendationStatusLabel(status)

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              aiStatus,
            }
          : post,
      ),
    )
    setMyPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              aiStatus,
            }
          : post,
      ),
    )
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadPosts() {
      const params = new URLSearchParams({
        page: String(page),
        size: String(pageSize),
      })
      const keyword = searchKeyword.trim()

      if (keyword) {
        params.set('search', keyword)
      }

      if (activeCategory !== '전체') {
        params.set('tag', activeCategory)
      }

      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await fetch(`/api/posts?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = await readJsonResponse<PostListResponse>(response)

        if (!response.ok) {
          throw new Error(data.message ?? '게시글 목록을 불러오지 못했습니다.')
        }

        setPosts(data.items.map(mapPostListItem))
        setPostTotal(data.total)
        setTotalPages(Math.max(data.totalPages, 1))
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setPosts([])
        setPostTotal(0)
        setTotalPages(1)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : '게시글 목록을 불러오지 못했습니다.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadPosts()

    return () => {
      controller.abort()
    }
  }, [activeCategory, page, postListReloadKey, searchKeyword])

  useEffect(() => {
    if (currentView !== 'tags') {
      return
    }

    const controller = new AbortController()

    async function loadTagItems() {
      setIsTagsLoading(true)
      setTagErrorMessage('')

      try {
        const response = await fetch('/api/posts?page=1&size=100', {
          signal: controller.signal,
        })
        const data = await readJsonResponse<PostListResponse>(response)

        if (!response.ok) {
          throw new Error(data.message ?? '태그 목록을 불러오지 못했습니다.')
        }

        const tagCounts = new Map<string, number>()
        data.items.forEach((post) => {
          const tags = post.tags ?? []

          tags.forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
          })
        })

        setTagItems(
          Array.from(tagCounts.entries()).sort((firstTag, secondTag) => {
            if (secondTag[1] !== firstTag[1]) {
              return secondTag[1] - firstTag[1]
            }

            return firstTag[0].localeCompare(secondTag[0], 'ko-KR')
          }),
        )
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setTagErrorMessage(
          error instanceof Error
            ? error.message
            : '태그 목록을 불러오지 못했습니다.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setIsTagsLoading(false)
        }
      }
    }

    loadTagItems()

    return () => {
      controller.abort()
    }
  }, [currentView, postListReloadKey])

  useEffect(() => {
    if (aiModalState !== 'running') {
      return
    }

    const progressTimer = window.setInterval(() => {
      setAiProgress((currentProgress) => Math.min(currentProgress + 8, 92))
    }, 260)

    return () => {
      window.clearInterval(progressTimer)
    }
  }, [aiModalState])

  useEffect(() => {
    if (currentView !== 'aiGuide') {
      return
    }

    const controller = new AbortController()

    async function loadAiStatus() {
      setAiStatusErrorMessage('')

      try {
        const response = await fetch('/api/agent/status', {
          signal: controller.signal,
        })
        const data = await readJsonResponse<AiServiceStatus>(response)

        if (!response.ok) {
          throw new Error(data.message ?? 'AI 상태를 불러오지 못했습니다.')
        }

        setAiServiceStatus(data)
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setAiStatusErrorMessage(
          error instanceof Error
            ? error.message
            : 'AI 상태를 불러오지 못했습니다.',
        )
      }
    }

    loadAiStatus()

    return () => {
      controller.abort()
    }
  }, [currentView])

  function handleSearchKeywordChange(value: string) {
    setSearchKeyword(value)
    setPage(1)
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const keyword = searchKeyword.trim()

    setSelectedPost(null)
    setActiveCategory('전체')
    setPage(1)

    if (!keyword) {
      setCurrentView('board')
      return
    }

    setCurrentView('searchResults')
  }

  function handleCategoryChange(category: string) {
    setActiveCategory(category)
    setPage(1)
  }

  function openPostsByTag(tag: string) {
    setSearchKeyword('')
    handleCategoryChange(tag)
    setSelectedPost(null)
    setCurrentView('board')
  }

  async function loadPostDetail(
    postId: number,
    options: { updateHistory?: boolean } = {},
  ) {
    setIsDetailLoading(true)
    setDetailErrorMessage('')
    setCommentErrorMessage('')
    setCommentSubmitMessage('')
    setCommentContent('')
    setEditingCommentId(null)
    setEditingCommentContent('')
    setPostDeleteErrorMessage('')
    setComments([])
    setAiRecommendation(null)
    setAiRecommendationErrorMessage('')
    setCurrentView('board')

    if (options.updateHistory ?? true) {
      updateBrowserHistory({ appView: 'post', postId }, 'push')
    }

    try {
      const [postResponse, commentsResponse, aiRecommendationResponse] =
        await Promise.all([
          fetch(`/api/posts/${postId}`),
          fetch(`/api/posts/${postId}/comments`),
          fetch(`/api/agent/posts/${postId}/recommendation`),
        ])
      const postData = await readJsonResponse<PostDetailItem>(postResponse)
      const commentsData =
        await readJsonResponse<CommentItem[]>(commentsResponse)
      const aiRecommendationData =
        await readJsonResponse<AiRecommendation>(aiRecommendationResponse)

      if (!postResponse.ok) {
        throw new Error(postData.message ?? '게시글을 불러오지 못했습니다.')
      }

      setSelectedPost(postData)

      if (commentsResponse.ok && Array.isArray(commentsData)) {
        setComments(commentsData)
      } else {
        setCommentErrorMessage(
          commentsData.message ?? '댓글을 불러오지 못했습니다.',
        )
      }

      if (aiRecommendationResponse.ok && isAiRecommendation(aiRecommendationData)) {
        setAiRecommendation(aiRecommendationData)
        syncPostAiRecommendationStatus(postId, aiRecommendationData.status)
      }
    } catch (error) {
      setDetailErrorMessage(
        error instanceof Error
          ? error.message
          : '게시글을 불러오지 못했습니다.',
      )
    } finally {
      setIsDetailLoading(false)
    }
  }

  function goBackToList(options: { updateHistory?: boolean } = {}) {
    setSelectedPost(null)
    setComments([])
    setDetailErrorMessage('')
    setCommentErrorMessage('')
    setCommentSubmitMessage('')
    setCommentContent('')
    setEditingCommentId(null)
    setEditingCommentContent('')
    setPostDeleteErrorMessage('')
    setAiRecommendation(null)
    setAiRecommendationErrorMessage('')
    setAiModalState('closed')
    setAiProgress(0)
    setCurrentView('board')

    if (options.updateHistory ?? true) {
      updateBrowserHistory({ appView: 'board' }, 'replace')
    }
  }

  useEffect(() => {
    const initialRoute = getAppRouteFromPath()
    let initialRouteTimer: number | null = null

    updateBrowserHistory(initialRoute, 'replace')

    if (initialRoute.appView === 'post' && initialRoute.postId) {
      initialRouteTimer = window.setTimeout(() => {
        void loadPostDetail(initialRoute.postId as number, {
          updateHistory: false,
        })
      }, 0)
    }

    function handlePopState(event: PopStateEvent) {
      const state = (event.state as AppHistoryState | null) ?? getAppRouteFromPath()
      const postId = state.appView === 'post' ? state.postId : null

      isApplyingHistoryRef.current = true

      if (postId) {
        void loadPostDetail(postId, { updateHistory: false })
      } else {
        goBackToList({ updateHistory: false })
        setCurrentView(state.appView === 'post' ? 'board' : state.appView)
      }

      window.setTimeout(() => {
        isApplyingHistoryRef.current = false
      }, 0)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      if (initialRouteTimer !== null) {
        window.clearTimeout(initialRouteTimer)
      }

      window.removeEventListener('popstate', handlePopState)
    }
    // The history listener must be registered once for the current app shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      return
    }

    if (selectedPost) {
      updateBrowserHistory(
        {
          appView: 'post',
          postId: selectedPost.id,
        },
        'push',
      )
      return
    }

    updateBrowserHistory({ appView: currentView }, 'push')
  }, [currentView, selectedPost])

  async function handleCreateComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedPost) {
      return
    }

    const content = commentContent.trim()

    if (!accessToken) {
      setCommentErrorMessage('로그인 후 댓글을 작성할 수 있습니다.')
      return
    }

    if (!content) {
      setCommentErrorMessage('댓글 내용을 입력해주세요.')
      return
    }

    setIsCommentSubmitting(true)
    setCommentErrorMessage('')
    setCommentSubmitMessage('')

    try {
      const response = await fetch(`/api/posts/${selectedPost.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content }),
      })
      const data = await readJsonResponse<CommentItem>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '댓글을 등록하지 못했습니다.')
      }

      setComments((currentComments) => [...currentComments, data])
      setCommentContent('')
      setCommentSubmitMessage('댓글이 등록되었습니다.')
      setPostListReloadKey((currentKey) => currentKey + 1)
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      const message = getErrorMessage(error, '댓글을 등록하지 못했습니다.')

      setCommentErrorMessage(
        getFriendlyErrorMessage(message, '댓글을 등록하지 못했습니다.'),
      )
    } finally {
      setIsCommentSubmitting(false)
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 댓글을 삭제할 수 있습니다.')
      setCurrentView('login')
      return
    }

    const shouldDelete = window.confirm('댓글을 삭제할까요?')

    if (!shouldDelete) {
      return
    }

    setDeletingCommentId(commentId)
    setCommentErrorMessage('')
    setCommentSubmitMessage('')

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await readJsonResponse<{ message?: string }>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '댓글을 삭제하지 못했습니다.')
      }

      setComments((currentComments) =>
        currentComments.filter((comment) => comment.id !== commentId),
      )
      setCommentSubmitMessage('댓글이 삭제되었습니다.')
      setPostListReloadKey((currentKey) => currentKey + 1)
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      const message = getErrorMessage(error, '댓글을 삭제하지 못했습니다.')

      setCommentErrorMessage(
        getFriendlyErrorMessage(message, '댓글을 삭제하지 못했습니다.'),
      )
    } finally {
      setDeletingCommentId(null)
    }
  }

  function startEditComment(comment: CommentItem) {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 댓글을 수정할 수 있습니다.')
      setCurrentView('login')
      return
    }

    setEditingCommentId(comment.id)
    setEditingCommentContent(comment.content)
    setCommentErrorMessage('')
    setCommentSubmitMessage('')
  }

  function cancelEditComment() {
    setEditingCommentId(null)
    setEditingCommentContent('')
  }

  async function handleUpdateComment(commentId: number) {
    const content = editingCommentContent.trim()

    if (!accessToken) {
      setLoginErrorMessage('로그인 후 댓글을 수정할 수 있습니다.')
      setCurrentView('login')
      return
    }

    if (!content) {
      setCommentErrorMessage('댓글 내용을 입력해주세요.')
      return
    }

    setIsCommentUpdating(true)
    setCommentErrorMessage('')
    setCommentSubmitMessage('')

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content }),
      })
      const data = await readJsonResponse<CommentItem>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '댓글을 수정하지 못했습니다.')
      }

      setComments((currentComments) =>
        currentComments.map((comment) =>
          comment.id === commentId ? data : comment,
        ),
      )
      setEditingCommentId(null)
      setEditingCommentContent('')
      setCommentSubmitMessage('댓글이 수정되었습니다.')
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      const message = getErrorMessage(error, '댓글을 수정하지 못했습니다.')

      setCommentErrorMessage(
        getFriendlyErrorMessage(message, '댓글을 수정하지 못했습니다.'),
      )
    } finally {
      setIsCommentUpdating(false)
    }
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsLoginSubmitting(true)
    setLoginErrorMessage('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      })
      const data = await readJsonResponse<LoginResponse>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '로그인에 실패했습니다.')
      }

      saveAuthSession(data.accessToken, data.user, shouldRememberLogin)
      setAccessToken(data.accessToken)
      setCurrentUser(data.user)
      setLoginPassword('')
      setCurrentView('board')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '로그인에 실패했습니다.'

      setLoginErrorMessage(
        getFriendlyErrorMessage(message, '로그인에 실패했습니다.'),
      )
    } finally {
      setIsLoginSubmitting(false)
    }
  }

  function handleForgotPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setForgotSubmitMessage(
      '비밀번호 재설정 메일 발송 기능은 아직 백엔드 연결 전입니다.',
    )
  }

  async function handleSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (signupPassword !== signupPasswordConfirm) {
      setSignupErrorMessage('비밀번호가 서로 일치하지 않습니다.')
      return
    }

    setIsSignupSubmitting(true)
    setSignupErrorMessage('')
    setSignupSubmitMessage('')

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: signupEmail,
          password: signupPassword,
          nickname: signupNickname,
        }),
      })
      const data = await readJsonResponse<{ message?: string }>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '회원가입에 실패했습니다.')
      }

      setSignupSubmitMessage('회원가입이 완료되었습니다. 로그인해주세요.')
      setLoginEmail(signupEmail)
      setLoginPassword('')
      setSignupEmail('')
      setSignupPassword('')
      setSignupPasswordConfirm('')
      setSignupNickname('')
      setCurrentView('login')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '회원가입에 실패했습니다.'

      setSignupErrorMessage(
        getFriendlyErrorMessage(message, '회원가입에 실패했습니다.'),
      )
    } finally {
      setIsSignupSubmitting(false)
    }
  }

  function handleLogout() {
    clearAuthSession()
    setAccessToken('')
    setCurrentUser(null)
    setMe(null)
    setMyPosts([])
    setMyComments([])
    setMyAiRecommendations([])
    setCurrentView('board')
    setCommentErrorMessage('')
    setCommentSubmitMessage('')
  }

  function handleExpiredSession(error: unknown) {
    const message = getErrorMessage(error, 'Invalid token')

    if (!isExpiredSessionMessage(message)) {
      return false
    }

    clearAuthSession()
    setAccessToken('')
    setCurrentUser(null)
    setMe(null)
    setMyPosts([])
    setMyComments([])
    setMyAiRecommendations([])
    setLoginErrorMessage(
      getFriendlyErrorMessage(message, '로그인이 만료되었습니다.'),
    )
    setCurrentView('login')

    return true
  }

  async function openMyPage() {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 마이페이지를 볼 수 있습니다.')
      setCurrentView('login')
      return
    }

    setCurrentView('mypage')
    setMyPageSection('info')
    setIsMeLoading(true)
    setMeErrorMessage('')
    setMyPostsErrorMessage('')
    setMyCommentsErrorMessage('')
    setMyAiRecommendationsErrorMessage('')

    try {
      const response = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await readJsonResponse<LoginUser>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '내 정보를 불러오지 못했습니다.')
      }

      updateSavedUser(data)
      setCurrentUser(data)
      setMe(data)

      const [postsResult, commentsResult, aiRecommendationsResult] =
        await Promise.allSettled([
        fetchMyPostItems(accessToken),
        fetchMyCommentItems(accessToken),
        fetchMyAiRecommendationItems(accessToken),
      ])

      if (postsResult.status === 'fulfilled') {
        setMyPosts(postsResult.value)
      } else if (handleExpiredSession(postsResult.reason)) {
        return
      } else {
        setMyPosts([])
        const message = getErrorMessage(
          postsResult.reason,
          '내가 작성한 글을 불러오지 못했습니다.',
        )

        setMyPostsErrorMessage(
          getFriendlyErrorMessage(
            message,
            '내가 작성한 글을 불러오지 못했습니다.',
          ),
        )
      }

      if (commentsResult.status === 'fulfilled') {
        setMyComments(commentsResult.value)
      } else if (handleExpiredSession(commentsResult.reason)) {
        return
      } else {
        setMyComments([])
        const message = getErrorMessage(
          commentsResult.reason,
          '내가 작성한 댓글을 불러오지 못했습니다.',
        )

        setMyCommentsErrorMessage(
          getFriendlyErrorMessage(
            message,
            '내가 작성한 댓글을 불러오지 못했습니다.',
          ),
        )
      }

      if (aiRecommendationsResult.status === 'fulfilled') {
        setMyAiRecommendations(aiRecommendationsResult.value)
      } else if (handleExpiredSession(aiRecommendationsResult.reason)) {
        return
      } else {
        setMyAiRecommendations([])
        const message = getErrorMessage(
          aiRecommendationsResult.reason,
          'AI 추천 기록을 불러오지 못했습니다.',
        )

        setMyAiRecommendationsErrorMessage(
          getFriendlyErrorMessage(
            message,
            'AI 추천 기록을 불러오지 못했습니다.',
          ),
        )
      }
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      const message = getErrorMessage(error, '내 정보를 불러오지 못했습니다.')

      setMeErrorMessage(
        getFriendlyErrorMessage(message, '내 정보를 불러오지 못했습니다.'),
      )
    } finally {
      setIsMeLoading(false)
    }
  }

  async function loadMyPosts() {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 내가 작성한 글을 볼 수 있습니다.')
      setCurrentView('login')
      return
    }

    setMyPageSection('posts')
    setIsMyPostsLoading(true)
    setMyPostsErrorMessage('')

    try {
      setMyPosts(await fetchMyPostItems(accessToken))
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      setMyPosts([])
      const message = getErrorMessage(
        error,
        '내가 작성한 글을 불러오지 못했습니다.',
      )

      setMyPostsErrorMessage(
        getFriendlyErrorMessage(
          message,
          '내가 작성한 글을 불러오지 못했습니다.',
        ),
      )
    } finally {
      setIsMyPostsLoading(false)
    }
  }

  async function loadMyComments() {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 내가 작성한 댓글을 볼 수 있습니다.')
      setCurrentView('login')
      return
    }

    setMyPageSection('comments')
    setIsMyCommentsLoading(true)
    setMyCommentsErrorMessage('')

    try {
      setMyComments(await fetchMyCommentItems(accessToken))
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      setMyComments([])
      const message = getErrorMessage(
        error,
        '내가 작성한 댓글을 불러오지 못했습니다.',
      )

      setMyCommentsErrorMessage(
        getFriendlyErrorMessage(
          message,
          '내가 작성한 댓글을 불러오지 못했습니다.',
        ),
      )
    } finally {
      setIsMyCommentsLoading(false)
    }
  }

  async function loadMyAiRecommendations() {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 AI 추천 기록을 볼 수 있습니다.')
      setCurrentView('login')
      return
    }

    setMyPageSection('aiHistory')
    setIsMyAiRecommendationsLoading(true)
    setMyAiRecommendationsErrorMessage('')

    try {
      setMyAiRecommendations(await fetchMyAiRecommendationItems(accessToken))
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      setMyAiRecommendations([])
      const message = getErrorMessage(
        error,
        'AI 추천 기록을 불러오지 못했습니다.',
      )

      setMyAiRecommendationsErrorMessage(
        getFriendlyErrorMessage(
          message,
          'AI 추천 기록을 불러오지 못했습니다.',
        ),
      )
    } finally {
      setIsMyAiRecommendationsLoading(false)
    }
  }

  async function handleDeletePost() {
    if (!selectedPost) {
      return
    }

    if (!accessToken) {
      setLoginErrorMessage('로그인 후 글을 삭제할 수 있습니다.')
      setCurrentView('login')
      return
    }

    const shouldDelete = window.confirm('게시글을 삭제할까요?')

    if (!shouldDelete) {
      return
    }

    setIsPostDeleting(true)
    setPostDeleteErrorMessage('')

    try {
      const response = await fetch(`/api/posts/${selectedPost.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await readJsonResponse<{ message?: string }>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '게시글을 삭제하지 못했습니다.')
      }

      goBackToList()
      setPage(1)
      setPostListReloadKey((currentKey) => currentKey + 1)
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      const message = getErrorMessage(error, '게시글을 삭제하지 못했습니다.')

      setPostDeleteErrorMessage(
        getFriendlyErrorMessage(message, '게시글을 삭제하지 못했습니다.'),
      )
    } finally {
      setIsPostDeleting(false)
    }
  }

  function openWriteView() {
    if (!accessToken) {
      setLoginErrorMessage('로그인 후 글을 작성할 수 있습니다.')
      setCurrentView('login')
      return
    }

    setEditingPostId(null)
    setPostTitle('')
    setPostContent('')
    setPostTagInput('')
    setPostDraftAdditionalRequest('')
    setPostDraftAgentResult(null)
    setPostDraftAgentErrorMessage('')
    setPostCreateErrorMessage('')
    setCurrentView('write')
  }

  async function openAiRecommendationModal() {
    if (!selectedPost || isAiRecommendationLoading) {
      return
    }

    if (!accessToken) {
      setAiRecommendationErrorMessage('로그인 후 AI 추천을 실행할 수 있습니다.')
      setLoginErrorMessage('로그인 후 AI 추천을 실행할 수 있습니다.')
      setCurrentView('login')
      return
    }

    setAiProgress(8)
    setAiModalState('running')
    setIsAiRecommendationLoading(true)
    setAiRecommendationErrorMessage('')

    try {
      const response = await fetch(
        `/api/agent/posts/${selectedPost.id}/recommendation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            nutritionGoal: postAiRecommendationGoal,
            additionalRequest: postAiAdditionalRequest.trim(),
          }),
        },
      )
      const data = await readJsonResponse<AiRecommendation>(response)

      if (!response.ok) {
        throw new Error(data.message ?? 'AI 추천을 생성하지 못했습니다.')
      }

      if (!isAiRecommendation(data)) {
        throw new Error('AI 추천 결과를 읽지 못했습니다.')
      }

      setAiRecommendation(data)
      syncPostAiRecommendationStatus(selectedPost.id, data.status)
      setMyAiRecommendations((currentRecommendations) => [
        {
          ...data,
          post: selectedPost
            ? {
                id: selectedPost.id,
                title: selectedPost.title,
              }
            : null,
        },
        ...currentRecommendations.filter(
          (recommendation) => recommendation.id !== data.id,
        ),
      ])
      setAiProgress(100)
      setAiModalState('result')
    } catch (error) {
      if (handleExpiredSession(error)) {
        setAiModalState('closed')
        return
      }

      setAiRecommendationErrorMessage(
        getFriendlyErrorMessage(
          error instanceof Error
            ? error.message
            : 'AI 추천을 생성하지 못했습니다.',
          'AI 추천을 생성하지 못했습니다.',
        ),
      )
      setAiModalState('closed')
    } finally {
      setIsAiRecommendationLoading(false)
    }
  }

  function openAiRecommendationResultModal() {
    if (!aiRecommendation) {
      return
    }

    setAiRecommendationErrorMessage('')
    setAiProgress(100)
    setAiModalState('result')
  }

  async function handleIngredientMetadataLookup() {
    const ingredients = getDirectAiIngredients()

    if (ingredients.length === 0) {
      setIngredientMetadataErrorMessage('재료를 하나 이상 입력해주세요.')
      setIngredientMetadata(null)
      return
    }

    setIsIngredientMetadataLoading(true)
    setIngredientMetadataErrorMessage('')

    try {
      const response = await fetch('/api/food-metadata/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ingredients }),
      })
      const data = await readJsonResponse<IngredientSetAnalysis>(response)

      if (!response.ok) {
        throw new Error(data.message ?? '식재료 정보를 불러오지 못했습니다.')
      }

      setIngredientMetadata(data)
    } catch (error) {
      setIngredientMetadata(null)
      setIngredientMetadataErrorMessage(
        getFriendlyErrorMessage(
          error instanceof Error
            ? error.message
            : '식재료 정보를 불러오지 못했습니다.',
          '식재료 정보를 불러오지 못했습니다.',
        ),
      )
    } finally {
      setIsIngredientMetadataLoading(false)
    }
  }

  async function handleMcpMetadataLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const ingredients = getMcpIngredients()

    if (ingredients.length === 0) {
      setMcpMetadataErrorMessage('재료를 하나 이상 입력해주세요.')
      setMcpMetadata(null)
      return
    }

    setIsMcpMetadataLoading(true)
    setMcpMetadataErrorMessage('')

    try {
      const response = await fetch('/api/food-metadata/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ingredients }),
      })
      const data = await readJsonResponse<IngredientSetAnalysis>(response)

      if (!response.ok) {
        throw new Error(data.message ?? 'MCP 식재료 정보를 불러오지 못했습니다.')
      }

      setMcpMetadata(data)
    } catch (error) {
      setMcpMetadata(null)
      setMcpMetadataErrorMessage(
        getFriendlyErrorMessage(
          error instanceof Error
            ? error.message
            : 'MCP 식재료 정보를 불러오지 못했습니다.',
          'MCP 식재료 정보를 불러오지 못했습니다.',
        ),
      )
    } finally {
      setIsMcpMetadataLoading(false)
    }
  }

  async function handleDirectAiRecommendation(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!accessToken) {
      setLoginErrorMessage('로그인 후 AI 추천을 실행할 수 있습니다.')
      setCurrentView('login')
      return
    }

    const ingredients = getDirectAiIngredients()

    if (ingredients.length === 0) {
      setDirectAiErrorMessage('재료를 하나 이상 입력해주세요.')
      return
    }

    setIsDirectAiSubmitting(true)
    setDirectAiErrorMessage('')

    try {
      const response = await fetch('/api/agent/recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ingredients,
          conditions: directAiConditionInput.trim(),
          nutritionGoal: directAiRecommendationGoal,
        }),
      })
      const data = await readJsonResponse<AiRecommendation>(response)

      if (!response.ok) {
        throw new Error(data.message ?? 'AI 추천을 생성하지 못했습니다.')
      }

      if (!isAiRecommendation(data)) {
        throw new Error('AI 추천 결과를 읽지 못했습니다.')
      }

      setDirectAiRecommendation(data)
      setMyAiRecommendations((currentRecommendations) => [
        {
          ...data,
          post: null,
        },
        ...currentRecommendations.filter(
          (recommendation) => recommendation.id !== data.id,
        ),
      ])
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      setDirectAiErrorMessage(
        getFriendlyErrorMessage(
          error instanceof Error
            ? error.message
            : 'AI 추천을 생성하지 못했습니다.',
          'AI 추천을 생성하지 못했습니다.',
        ),
      )
    } finally {
      setIsDirectAiSubmitting(false)
    }
  }

  function closeAiRecommendationModal() {
    setAiProgress(0)
    setAiModalState('closed')
  }

  function openEditView() {
    if (!selectedPost) {
      return
    }

    if (!accessToken) {
      setLoginErrorMessage('로그인 후 글을 수정할 수 있습니다.')
      setCurrentView('login')
      return
    }

    setEditingPostId(selectedPost.id)
    setPostTitle(selectedPost.title)
    setPostContent(selectedPost.content)
    setPostTagInput((selectedPost.tags ?? []).join(', '))
    setPostDraftAdditionalRequest('')
    setPostDraftAgentResult(null)
    setPostDraftAgentErrorMessage('')
    setPostCreateErrorMessage('')
    setPostDeleteErrorMessage('')
    setCurrentView('write')
  }

  function closeWriteView() {
    setPostCreateErrorMessage('')
    setPostDraftAgentErrorMessage('')
    setCurrentView('board')
  }

  async function handlePostDraftAgentAssist() {
    if (!accessToken) {
      setPostDraftAgentErrorMessage('로그인 후 AI 작성 보조를 실행할 수 있습니다.')
      setLoginErrorMessage('로그인 후 AI 작성 보조를 실행할 수 있습니다.')
      setCurrentView('login')
      return
    }

    if (
      !postTitle.trim() &&
      !postContent.trim() &&
      !postDraftAdditionalRequest.trim()
    ) {
      setPostDraftAgentErrorMessage('제목, 내용, 추가 요청 중 하나는 입력해주세요.')
      setPostDraftAgentResult(null)
      return
    }

    setIsPostDraftAgentLoading(true)
    setPostDraftAgentErrorMessage('')

    try {
      const response = await fetch('/api/agent/post-draft/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: postTitle,
          content: postContent,
          additionalRequest: postDraftAdditionalRequest,
        }),
      })
      const data = await readJsonResponse<PostDraftAgentResponse>(response)

      if (!response.ok) {
        throw new Error(data.message ?? 'AI 작성 보조를 실행하지 못했습니다.')
      }

      setPostDraftAgentResult(data)
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      setPostDraftAgentResult(null)
      setPostDraftAgentErrorMessage(
        getFriendlyErrorMessage(
          error instanceof Error
            ? error.message
            : 'AI 작성 보조를 실행하지 못했습니다.',
          'AI 작성 보조를 실행하지 못했습니다.',
        ),
      )
    } finally {
      setIsPostDraftAgentLoading(false)
    }
  }

  function applyPostDraftAgentSuggestion() {
    if (!postDraftAgentResult) {
      return
    }

    if (postDraftAgentResult.suggestedTitle) {
      setPostTitle(postDraftAgentResult.suggestedTitle.slice(0, 200))
    }

    if (postDraftAgentResult.suggestedBody) {
      setPostContent(postDraftAgentResult.suggestedBody.slice(0, 5000))
    }

    if (postDraftAgentResult.suggestedTags.length > 0) {
      setPostTagInput(postDraftAgentResult.suggestedTags.slice(0, 5).join(', '))
    }
  }

  async function handleCreatePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const title = postTitle.trim()
    const content = postContent.trim()
    const tagNames = postTagInput
      .split(',')
      .map((tagName) => tagName.trim())
      .filter(Boolean)

    if (!accessToken) {
      setPostCreateErrorMessage('로그인 후 글을 작성할 수 있습니다.')
      return
    }

    if (tagNames.length > 5) {
      setPostCreateErrorMessage('태그는 최대 5개까지 입력할 수 있습니다.')
      return
    }

    setIsPostCreating(true)
    setPostCreateErrorMessage('')

    try {
      const response = await fetch(
        editingPostId ? `/api/posts/${editingPostId}` : '/api/posts',
        {
          method: editingPostId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title,
            content,
            tagNames,
          }),
        },
      )
      const data = await readJsonResponse<PostDetailItem>(response)

      if (!response.ok) {
        throw new Error(
          data.message ??
            (editingPostId
              ? '게시글을 수정하지 못했습니다.'
              : '게시글을 등록하지 못했습니다.'),
        )
      }

      setPostTitle('')
      setPostContent('')
      setPostTagInput('')
      setPostDraftAdditionalRequest('')
      setPostDraftAgentResult(null)
      setPostDraftAgentErrorMessage('')
      setEditingPostId(null)
      setActiveCategory('전체')
      setSearchKeyword('')
      setPage(1)
      setPostListReloadKey((currentKey) => currentKey + 1)
      if (editingPostId) {
        setSelectedPost(data)
        setCurrentView('board')
      } else {
        setSelectedPost(null)
        setCurrentView('board')
      }
    } catch (error) {
      if (handleExpiredSession(error)) {
        return
      }

      const fallback = editingPostId
        ? '게시글을 수정하지 못했습니다.'
        : '게시글을 등록하지 못했습니다.'
      const message = getErrorMessage(error, fallback)

      setPostCreateErrorMessage(
        getFriendlyErrorMessage(message, fallback),
      )
    } finally {
      setIsPostCreating(false)
    }
  }

  return (
    <main className="board-page">
      <section
        className={`board-shell ${isAuthView ? 'auth-shell' : ''}`}
        aria-label="냉장고 파먹기 게시판"
      >
        <header className="top-bar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <strong>냉장고 파먹기</strong>
              <p>AI 레시피 추천 게시판</p>
            </div>
          </div>

          <form className="top-search" onSubmit={handleSearchSubmit}>
            <span className="sr-only">게시글 검색</span>
            <input
              type="search"
              placeholder="게시글 제목으로 검색하세요"
              value={searchKeyword}
              onChange={(event) => handleSearchKeywordChange(event.target.value)}
            />
            <button className="search-icon-button" type="submit" aria-label="검색">
              검색
            </button>
          </form>

          <div className="user-area">
            <button
              className="icon-button"
              type="button"
              aria-label="알림"
              onClick={() => {
                if (!currentUser) {
                  setLoginErrorMessage('로그인 후 알림을 확인할 수 있습니다.')
                  setCurrentView('login')
                } else {
                  setSelectedPost(null)
                  setCurrentView('notifications')
                }
              }}
            >
              bell
            </button>
            <div className="avatar" aria-hidden="true">
              {currentUser ? currentUser.nickname.slice(0, 1) : '?'}
            </div>
            <button
              className="profile-button"
              type="button"
              onClick={() => {
                if (!currentUser) {
                  setCurrentView('login')
                } else {
                  openMyPage()
                }
              }}
            >
              {currentUser ? `${currentUser.nickname}님` : '로그인'}
            </button>
            {currentUser ? (
              <button
                className="logout-button"
                type="button"
                onClick={handleLogout}
              >
                로그아웃
              </button>
            ) : null}
          </div>
        </header>

        {currentView === 'login' ? (
          <section className="login-view" aria-label="로그인">
            <div className="login-hero login-hero-home">
              <div className="auth-brand">
                <div className="brand-mark" aria-hidden="true">
                  <span />
                </div>
                <div>
                  <strong>냉장고 파먹기</strong>
                  <p>AI 레시피 추천 커뮤니티</p>
                </div>
              </div>

              <div className="login-hero-copy">
                <h1>냉장고 속 재료로 오늘 뭐 먹지?</h1>
                <p>
                  AI가 당신의 재료와 상황을 분석해 최적의 레시피를 추천해드려요!
                </p>
              </div>

              <div className="fridge-illustration" aria-hidden="true">
                <span className="leaf leaf-left" />
                <span className="leaf leaf-right" />
                <span className="table" />
                <span className="plate" />
                <span className="food food-one" />
                <span className="food food-two" />
                <span className="food food-three" />
                <span className="fridge">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>

            <form className="login-card" onSubmit={handleLoginSubmit}>
              <div>
                <h1>로그인</h1>
                <p>
                  계정이 없다면?
                  <button
                    className="inline-link"
                    type="button"
                    onClick={() => {
                      setSignupSubmitMessage('')
                      setLoginErrorMessage('')
                      setCurrentView('signup')
                    }}
                  >
                    회원가입
                  </button>
                </p>
              </div>

              <label>
                이메일
                <input
                  type="email"
                  placeholder="이메일을 입력하세요"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                비밀번호
                <span className="password-field">
                  <input
                    type={isLoginPasswordVisible ? 'text' : 'password'}
                    placeholder="비밀번호를 입력하세요"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setIsLoginPasswordVisible((isVisible) => !isVisible)
                    }
                  >
                    {isLoginPasswordVisible ? '숨김' : '보기'}
                  </button>
                </span>
              </label>

              <div className="auth-options">
                <label className="remember-check">
                  <input
                    type="checkbox"
                    checked={shouldRememberLogin}
                    onChange={(event) =>
                      setShouldRememberLogin(event.target.checked)
                    }
                  />
                  로그인 유지
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(loginEmail)
                    setForgotSubmitMessage('')
                    setCurrentView('forgotPassword')
                  }}
                >
                  비밀번호 찾기
                </button>
              </div>

              {loginErrorMessage ? (
                <p className="login-message error">{loginErrorMessage}</p>
              ) : signupSubmitMessage ? (
                <p className="login-message success">{signupSubmitMessage}</p>
              ) : null}

              <button type="submit" disabled={isLoginSubmitting}>
                {isLoginSubmitting ? '로그인 중' : '로그인'}
              </button>

              <button
                className="text-button"
                type="button"
                onClick={() => setCurrentView('board')}
              >
                게시판으로 돌아가기
              </button>
            </form>
          </section>
        ) : currentView === 'forgotPassword' ? (
          <section className="login-view" aria-label="비밀번호 찾기">
            <div className="login-hero">
              <strong>계정을 다시 찾고</strong>
              <p>냉장고 파먹기로 돌아와요.</p>
              <div className="mail-symbol" aria-hidden="true">
                <span />
              </div>
            </div>

            <form className="login-card" onSubmit={handleForgotPasswordSubmit}>
              <div>
                <h1>비밀번호 찾기</h1>
                <p>가입한 이메일을 입력하면 재설정 안내를 받을 수 있어요.</p>
              </div>

              <label>
                이메일
                <input
                  type="email"
                  placeholder="이메일을 입력하세요"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  required
                />
              </label>

              {forgotSubmitMessage ? (
                <p className="login-message success">{forgotSubmitMessage}</p>
              ) : null}

              <button type="submit">인증 메일 보내기</button>

              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setForgotSubmitMessage('')
                  setCurrentView('login')
                }}
              >
                로그인 페이지로 돌아가기
              </button>
            </form>
          </section>
        ) : currentView === 'mypage' ? (
          <section className="mypage-view" aria-label="마이페이지">
            <aside className="mypage-menu" aria-label="마이페이지 메뉴">
              <button
                className={myPageSection === 'info' ? 'active' : ''}
                type="button"
                onClick={() => setMyPageSection('info')}
              >
                <span aria-hidden="true">▣</span>
                내 정보
              </button>
              <button
                className={myPageSection === 'posts' ? 'active' : ''}
                type="button"
                onClick={loadMyPosts}
              >
                <span aria-hidden="true">□</span>
                내 게시글
              </button>
              <button
                className={myPageSection === 'comments' ? 'active' : ''}
                type="button"
                onClick={loadMyComments}
              >
                <span aria-hidden="true">◇</span>
                내 댓글
              </button>
              <button
                className={myPageSection === 'aiHistory' ? 'active' : ''}
                type="button"
                onClick={loadMyAiRecommendations}
              >
                <span aria-hidden="true">✧</span>
                AI 추천 기록
              </button>
              <button
                className={myPageSection === 'likes' ? 'active' : ''}
                type="button"
                onClick={() => setMyPageSection('likes')}
              >
                <span aria-hidden="true">♡</span>
                저장한 글
              </button>
              <button
                className={myPageSection === 'settings' ? 'active' : ''}
                type="button"
                onClick={() => setMyPageSection('settings')}
              >
                <span aria-hidden="true">⚙</span>
                설정
              </button>
            </aside>

            <section className="mypage-card">
              <div className="mypage-topbar">
                <button
                  className="back-button"
                  type="button"
                  onClick={() => setCurrentView('board')}
                >
                  게시판으로
                </button>
                <span className="mypage-ready-pill">정보 수정 준비 중</span>
              </div>

              {myPageSection === 'info' && isMeLoading ? (
                <div className="mypage-state">내 정보를 불러오는 중입니다.</div>
              ) : myPageSection === 'info' && meErrorMessage ? (
                <div className="mypage-state error">{meErrorMessage}</div>
              ) : myPageSection === 'info' && me ? (
                <>
                  <div className="mypage-profile">
                    <div className="mypage-avatar" aria-hidden="true">
                      <span>{me.nickname.slice(0, 1)}</span>
                    </div>
                    <div className="mypage-profile-copy">
                      <p>내 정보</p>
                      <h1>{me.nickname}</h1>
                      <span>{me.email}</span>
                    </div>
                  </div>

                  <dl className="mypage-info">
                    <div>
                      <dt>회원가입일</dt>
                      <dd>{formatDate(me.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>닉네임</dt>
                      <dd>{me.nickname}</dd>
                    </div>
                    <div>
                      <dt>이메일</dt>
                      <dd>{me.email}</dd>
                    </div>
                  </dl>

                  <section className="mypage-overview" aria-label="활동 통계">
                    <h2>활동 통계</h2>
                    <div className="mypage-stats">
                      <div>
                        <span>작성한 글</span>
                        <strong>{myPosts.length}</strong>
                      </div>
                      <div>
                        <span>작성한 댓글</span>
                        <strong>{myComments.length}</strong>
                      </div>
                      <div>
                        <span>AI 추천 기록</span>
                        <strong>{myAiRecommendations.length}</strong>
                      </div>
                      <div>
                        <span>저장한 글</span>
                        <strong>준비 중</strong>
                      </div>
                    </div>
                  </section>

                  <section className="mypage-activity-card" aria-label="최근 활동">
                    <div className="mypage-section-heading compact">
                      <h1>최근 활동</h1>
                      <p>내가 남긴 게시글과 댓글을 빠르게 확인합니다.</p>
                    </div>

                    {hasMyActivity ? (
                      <ul className="mypage-activity-list">
                        {recentMyPosts.map((post) => (
                          <li key={`post-${post.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentView('board')
                                loadPostDetail(post.id)
                              }}
                            >
                              <span className="activity-type post">게시글</span>
                              <strong>{post.title}</strong>
                              <time dateTime={post.createdAt}>{post.createdAt}</time>
                            </button>
                          </li>
                        ))}
                        {recentMyComments.map((comment) => (
                          <li key={`comment-${comment.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentView('board')
                                loadPostDetail(comment.post.id)
                              }}
                            >
                              <span className="activity-type comment">댓글</span>
                              <strong>{comment.post.title}</strong>
                              <time dateTime={comment.createdAt}>
                                {formatDate(comment.createdAt)}
                              </time>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mypage-state compact">
                        아직 표시할 활동이 없습니다.
                      </div>
                    )}

                    <button
                      className="mypage-more-button"
                      type="button"
                      onClick={loadMyPosts}
                    >
                      더보기
                    </button>
                  </section>
                </>
              ) : myPageSection === 'info' ? (
                <div className="mypage-state">로그인 정보를 확인할 수 없습니다.</div>
              ) : myPageSection === 'posts' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>내 게시글</h1>
                    <p>내 계정으로 작성한 게시글만 모아봅니다.</p>
                  </div>

                  {isMyPostsLoading ? (
                    <div className="mypage-state">내 글을 불러오는 중입니다.</div>
                  ) : myPostsErrorMessage ? (
                    <div className="mypage-state error">{myPostsErrorMessage}</div>
                  ) : myPosts.length === 0 ? (
                    <div className="mypage-state">아직 작성한 글이 없습니다.</div>
                  ) : (
                    <ul className="mypage-post-list">
                      {myPosts.map((post) => (
                        <li key={post.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentView('board')
                              loadPostDetail(post.id)
                            }}
                          >
                            {post.title}
                          </button>
                          <div className="mypage-post-meta">
                            <span>{post.createdAt}</span>
                            <span>{post.author}</span>
                            <span
                              className={`status-badge ${getAiRecommendationStatusClass(post.aiStatus)}`}
                            >
                              {post.aiStatus}
                            </span>
                          </div>
                          <div className="tag-stack">
                            {post.tags.slice(0, 3).map((tag) => (
                              <span className="tag-chip" key={tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : myPageSection === 'comments' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>내 댓글</h1>
                    <p>내 계정으로 남긴 댓글을 모아봅니다.</p>
                  </div>

                  {isMyCommentsLoading ? (
                    <div className="mypage-state">내 댓글을 불러오는 중입니다.</div>
                  ) : myCommentsErrorMessage ? (
                    <div className="mypage-state error">
                      {myCommentsErrorMessage}
                    </div>
                  ) : myComments.length === 0 ? (
                    <div className="mypage-state">아직 작성한 댓글이 없습니다.</div>
                  ) : (
                    <ul className="mypage-comment-list">
                      {myComments.map((comment) => (
                        <li key={comment.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentView('board')
                              loadPostDetail(comment.post.id)
                            }}
                          >
                            {comment.post.title}
                          </button>
                          <p>{comment.content}</p>
                          <time dateTime={comment.createdAt}>
                            {formatDate(comment.createdAt)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : myPageSection === 'aiHistory' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>AI 추천 기록</h1>
                    <p>내가 실행한 추천 결과와 참고 게시글을 모아봅니다.</p>
                  </div>

                  {isMyAiRecommendationsLoading ? (
                    <div className="mypage-state">
                      AI 추천 기록을 불러오는 중입니다.
                    </div>
                  ) : myAiRecommendationsErrorMessage ? (
                    <div className="mypage-state error">
                      {myAiRecommendationsErrorMessage}
                    </div>
                  ) : myAiRecommendations.length === 0 ? (
                    <div className="mypage-state">아직 AI 추천 기록이 없습니다.</div>
                  ) : (
                    <ul className="mypage-ai-list">
                      {myAiRecommendations.map((recommendation) => (
                        <li key={recommendation.id}>
                          <div className="mypage-ai-item-header">
                            <strong>{recommendation.menuName}</strong>
                            <span
                              className={`status-badge ${getAiRecommendationStatusClass(
                                getAiRecommendationStatusLabel(
                                  recommendation.status,
                                ),
                              )}`}
                            >
                              {getAiRecommendationStatusLabel(recommendation.status)}
                            </span>
                          </div>
	                          <div className="mypage-post-meta">
	                            <time dateTime={recommendation.createdAt}>
	                              {formatDate(recommendation.createdAt)}
	                            </time>
	                            <span>
	                              {recommendation.post
	                                ? recommendation.post.title
	                                : '직접 입력 추천'}
	                            </span>
	                            <span>{recommendation.difficulty}</span>
	                            <span>{getAiGroundingLabel(recommendation.grounding)}</span>
	                          </div>
	                          <p className="ai-grounding-note">
	                            {getAiGroundingMessage(recommendation.grounding)}
	                          </p>
	                          <p>{recommendation.reason}</p>
                          {recommendation.referencedPosts.length > 0 ? (
                            <ul className="ai-reference-list">
                              {recommendation.referencedPosts
                                .slice(0, 3)
                                .map((post) => (
                                  <li key={post.postId}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCurrentView('board')
                                        loadPostDetail(post.postId)
                                      }}
                                    >
                                      {post.title}
                                    </button>
                                    <span>{Math.round(post.similarity * 100)}%</span>
                                  </li>
                                ))}
                            </ul>
	                          ) : (
	                            <span className="mypage-ai-empty-reference">
	                              {recommendation.grounding === 'GENERAL_AI'
	                                ? '현재 내용과 일반 요리 지식으로 추천했습니다.'
	                                : '참고한 게시글이 없습니다.'}
	                            </span>
	                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : myPageSection === 'likes' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>저장한 글</h1>
                    <p>저장 기능을 붙이면 이곳에서 모아볼 수 있습니다.</p>
                  </div>

                  <div className="coming-soon-panel">
                    <strong>아직 연결 전입니다.</strong>
                    <p>
                      저장 API가 준비되면 내가 보관한 게시글 목록으로 바뀝니다.
                    </p>
                  </div>
                </div>
              ) : myPageSection === 'settings' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>설정</h1>
                    <p>계정 설정과 알림 설정을 이곳에 연결할 수 있습니다.</p>
                  </div>

                  <div className="settings-list">
                    <div>
                      <span>계정 정보 수정</span>
                      <strong>준비 중</strong>
                    </div>
                    <div>
                      <span>알림 설정</span>
                      <strong>준비 중</strong>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </section>
        ) : currentView === 'tags' ? (
          <section className="utility-view tag-view" aria-label="태그">
            <button
              className="back-button"
              type="button"
              onClick={() => setCurrentView('board')}
            >
              게시판으로
            </button>

            <div className="tag-page-card">
              <div className="utility-heading tag-heading">
                <div>
                  <h1>태그</h1>
                  <p>
                    관심 있는 재료나 상황 태그를 선택하면 해당 게시글만 모아볼 수
                    있습니다.
                  </p>
                </div>
                <strong>{tagItems.length || popularTagItems.length}개 태그</strong>
              </div>

              <section className="popular-tag-section" aria-label="인기 태그">
                <h2>인기 태그</h2>
                <div className="popular-tag-strip">
                  {topTagItems.length > 0
                    ? topTagItems.map(([tag, count]) => (
                        <button
                          className="popular-tag-button"
                          type="button"
                          key={tag}
                          onClick={() => openPostsByTag(tag)}
                        >
                          <span>{tag}</span>
                          <strong>{count}</strong>
                        </button>
                      ))
                    : categories
                        .filter((category) => category !== '전체')
                        .map((category) => (
                          <button
                            className="popular-tag-button"
                            type="button"
                            key={category}
                            onClick={() => openPostsByTag(category)}
                          >
                            <span>{category}</span>
                            <strong>0</strong>
                          </button>
                        ))}
                </div>
              </section>

              <section className="all-tag-section" aria-label="전체 태그">
                <div className="tag-section-title">
                  <div>
                    <h2>전체 태그</h2>
                    <p>초성으로 빠르게 좁혀볼 수 있습니다.</p>
                  </div>
                  {isTagsLoading ? <span>불러오는 중</span> : null}
                </div>

                <div className="tag-filter-row" aria-label="태그 초성 필터">
                  {tagFilterGroups.map((group) => (
                    <button
                      className={group === activeTagGroup ? 'selected' : ''}
                      type="button"
                      key={group}
                      onClick={() => setActiveTagGroup(group)}
                    >
                      {group}
                    </button>
                  ))}
                </div>

                {isTagsLoading && tagItems.length === 0 ? (
                  <p className="tag-empty-state">태그를 불러오는 중입니다.</p>
                ) : tagErrorMessage ? (
                  <p className="tag-empty-state error">{tagErrorMessage}</p>
                ) : filteredTagItems.length === 0 && !isTagsLoading ? (
                  <p className="tag-empty-state">조건에 맞는 태그가 없습니다.</p>
                ) : (
                  <div className="all-tag-grid">
                    {filteredTagItems.map(([tag, count]) => (
                      <button
                        className="tag-token-button"
                        type="button"
                        key={tag}
                        onClick={() => openPostsByTag(tag)}
                      >
                        <span>{tag}</span>
                        <strong>{count}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        ) : currentView === 'aiGuide' ? (
          <section className="utility-view guide-view" aria-label="AI 추천 가이드">
            <button
              className="back-button"
              type="button"
              onClick={() => setCurrentView('board')}
            >
              게시판으로
            </button>

            <div className="utility-heading">
              <h1>AI 추천 가이드</h1>
              <p>재료와 상황을 바탕으로 어울리는 한 끼를 정리해드려요.</p>
            </div>

            <div className="guide-grid">
              <article>
                <span>1</span>
                <strong>재료</strong>
                <p>냉장고에 있는 재료를 글 내용에 적어둡니다.</p>
              </article>
              <article>
                <span>2</span>
                <strong>상황</strong>
                <p>아침, 점심, 저녁처럼 식사 상황을 함께 남깁니다.</p>
              </article>
              <article>
                <span>3</span>
                <strong>시간</strong>
                <p>조리 가능 시간을 적으면 추천 기준으로 쓰기 좋습니다.</p>
              </article>
            </div>

            <section className="ai-status-panel" aria-label="AI 추천 상태">
              {aiStatusErrorMessage ? (
                <p className="direct-ai-message error">{aiStatusErrorMessage}</p>
              ) : (
                <>
                  <div>
                    <span>동작 모드</span>
                    <strong>
                      {aiServiceStatus?.openAiConfigured
                        ? 'OpenAI 추천 모드'
                        : '기본 추천 모드'}
                    </strong>
                  </div>
                  <div>
	                    <span>실행 제한</span>
	                    <strong>제한 없음</strong>
	                  </div>
	                  <div>
	                    <span>검색 방식</span>
	                    <strong>
	                      {aiServiceStatus?.pgvectorInstalled
	                        ? 'pgvector'
	                        : aiServiceStatus?.pgvectorAvailable
	                          ? 'pgvector 마이그레이션 필요'
	                          : 'pgvector 환경 필요'}
	                    </strong>
	                  </div>
                </>
              )}
            </section>

            <section className="direct-ai-panel" aria-label="직접 재료 입력 AI 추천">
              <form className="direct-ai-form" onSubmit={handleDirectAiRecommendation}>
                <label>
                  재료
                  <input
                    type="text"
                    placeholder="예: 계란, 김치, 양파"
                    value={directAiIngredientInput}
                    onChange={(event) => {
                      setDirectAiIngredientInput(event.target.value)
                      setIngredientMetadataErrorMessage('')
                    }}
                  />
                </label>
	                <label>
	                  추가 요청
	                  <input
	                    type="text"
	                    placeholder="예: 10분 안에, 매운맛 적게, 전자레인지로만"
	                    value={directAiConditionInput}
	                    onChange={(event) =>
                      setDirectAiConditionInput(event.target.value)
                    }
                  />
                </label>
                <div className="ai-goal-selector" role="group" aria-label="추천 목표">
                  <span>추천 목표</span>
                  <div>
                    {aiRecommendationGoalOptions.map((option) => (
                      <button
                        className={
                          directAiRecommendationGoal === option.id
                            ? 'selected'
                            : ''
                        }
                        key={option.id}
                        type="button"
                        onClick={() => setDirectAiRecommendationGoal(option.id)}
                        title={option.description}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={isDirectAiSubmitting}>
                  {isDirectAiSubmitting ? '추천 생성 중' : 'AI 추천 실행'}
                </button>
              </form>

              <section
                className="ingredient-metadata-panel"
                aria-label="식재료 영양 정보"
              >
                <div className="ingredient-metadata-heading">
                  <div>
                    <span>공공데이터 기반</span>
                    <h2>식재료 영양 정보</h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleIngredientMetadataLookup}
                    disabled={isIngredientMetadataLoading}
                  >
                    {isIngredientMetadataLoading ? '확인 중' : '영양 정보 확인'}
                  </button>
                </div>

                {ingredientMetadataErrorMessage ? (
                  <p className="direct-ai-message error">
                    {ingredientMetadataErrorMessage}
                  </p>
                ) : null}

                {ingredientMetadata ? (
                  <div className="ingredient-metadata-content">
                    <div className="ingredient-metadata-source">
                      <span>{ingredientMetadata.dataSource}</span>
                      <strong>
                        {getIngredientMatchLabel(ingredientMetadata.matchStatus)}
                      </strong>
                    </div>
                    <ul className="ingredient-metadata-list">
                      {ingredientMetadata.ingredients.map((ingredient) => (
                        <li key={`${ingredient.originalInput}-${ingredient.normalizedInput}`}>
                          <div className="ingredient-metadata-card-heading">
                            <div>
                              <span>{ingredient.originalInput}</span>
                              <strong>
                                {ingredient.matchedName ??
                                  ingredient.normalizedInput}
                              </strong>
                            </div>
                            <em>{getIngredientMatchLabel(ingredient.matchStatus)}</em>
                          </div>
                          <dl>
                            <div>
                              <dt>열량</dt>
                              <dd>
                                {formatNutritionValue(
                                  ingredient.nutrition.energyKcal,
                                  'kcal',
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>단백질</dt>
                              <dd>
                                {formatNutritionValue(
                                  ingredient.nutrition.proteinG,
                                  'g',
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>지방</dt>
                              <dd>
                                {formatNutritionValue(
                                  ingredient.nutrition.fatG,
                                  'g',
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>나트륨</dt>
                              <dd>
                                {formatNutritionValue(
                                  ingredient.nutrition.sodiumMg,
                                  'mg',
                                )}
                              </dd>
                            </div>
                          </dl>
                          <p>
                            기준량:{' '}
                            {ingredient.servingSize ?? '공공데이터 응답 기준'}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {ingredientMetadata.notes.length > 0 ? (
                      <p className="ingredient-metadata-note">
                        {ingredientMetadata.notes[0]}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="ingredient-metadata-empty">
                    재료를 입력하고 영양 정보를 확인해보세요.
                  </p>
                )}
              </section>

              {directAiErrorMessage ? (
                <p className="direct-ai-message error">{directAiErrorMessage}</p>
              ) : null}

              {directAiRecommendation ? (
                <div className="direct-ai-result">
                  <div>
                    <span>추천 메뉴</span>
                    <strong>{directAiRecommendation.menuName}</strong>
                    <p>{directAiRecommendation.reason}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>조리 시간</dt>
                      <dd>
                        {directAiRecommendation.estimatedCookingTime
                          ? `${directAiRecommendation.estimatedCookingTime}분`
                          : '상황에 따라 조정'}
                      </dd>
                    </div>
	                    <div>
	                      <dt>난이도</dt>
	                      <dd>{directAiRecommendation.difficulty}</dd>
	                    </div>
		                    <div>
		                      <dt>추천 근거</dt>
		                      <dd>{getAiGroundingLabel(directAiRecommendation.grounding)}</dd>
		                    </div>
                    <div>
                      <dt>추천 목표</dt>
                      <dd>
                        {getAiRecommendationGoalLabel(directAiRecommendationGoal)}
                      </dd>
                    </div>
		                    <div>
		                      <dt>부족 재료</dt>
                      <dd>
                        {directAiRecommendation.missingIngredients.length > 0
                          ? directAiRecommendation.missingIngredients.join(', ')
                          : '없음'}
                      </dd>
	                    </div>
	                  </dl>
	                  <p className="ai-grounding-note">
	                    {getAiGroundingMessage(directAiRecommendation.grounding)}
	                  </p>
	                  <p>{directAiRecommendation.content}</p>
	                  {directAiRecommendation.referencedPosts.length > 0 ? (
                    <section>
                        <h2>AI가 참고한 댓글 답변</h2>
                      <ul className="ai-reference-list">
                        {directAiRecommendation.referencedPosts.map((post) => (
                          <li key={post.postId}>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentView('board')
                                loadPostDetail(post.postId)
                              }}
                            >
                              {post.title}
                            </button>
                            <span>{Math.round(post.similarity * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    </section>
	                  ) : directAiRecommendation.grounding === 'GENERAL_AI' ? (
	                    <p className="ai-grounding-empty">
	                      참고한 게시글 없이 현재 입력과 일반 요리 지식으로 만들었어요.
	                    </p>
	                  ) : null}
	                </div>
              ) : null}
            </section>
          </section>
        ) : currentView === 'mcpCheck' ? (
          <section className="utility-view guide-view" aria-label="MCP 확인">
            <button
              className="back-button"
              type="button"
              onClick={() => setCurrentView('board')}
            >
              게시판으로
            </button>

            <div className="utility-heading">
              <h1>MCP 확인</h1>
              <p>식재료 메타데이터 MCP 흐름이 실제 영양 정보를 가져오는지 확인합니다.</p>
            </div>

            <section className="mcp-check-panel" aria-label="식재료 MCP 조회">
              <form className="mcp-check-form" onSubmit={handleMcpMetadataLookup}>
                <label>
                  식재료
                  <input
                    type="text"
                    placeholder="예: 계란, 두부, 대파"
                    value={mcpIngredientInput}
                    onChange={(event) => {
                      setMcpIngredientInput(event.target.value)
                      setMcpMetadataErrorMessage('')
                    }}
                  />
                </label>
                <button type="submit" disabled={isMcpMetadataLoading}>
                  {isMcpMetadataLoading ? '조회 중' : 'MCP 조회'}
                </button>
              </form>

              {mcpMetadataErrorMessage ? (
                <p className="direct-ai-message error">{mcpMetadataErrorMessage}</p>
              ) : null}

              {mcpMetadata ? (
                <div className="ingredient-metadata-content">
                  <div className="ingredient-metadata-source">
                    <span>{mcpMetadata.dataSource}</span>
                    <strong>{getIngredientMatchLabel(mcpMetadata.matchStatus)}</strong>
                  </div>
                  <ul className="ingredient-metadata-list">
                    {mcpMetadata.ingredients.map((ingredient) => (
                      <li
                        key={`mcp-${ingredient.originalInput}-${ingredient.normalizedInput}`}
                      >
                        <div className="ingredient-metadata-card-heading">
                          <div>
                            <span>{ingredient.originalInput}</span>
                            <strong>
                              {ingredient.matchedName ?? ingredient.normalizedInput}
                            </strong>
                          </div>
                          <em>{getIngredientMatchLabel(ingredient.matchStatus)}</em>
                        </div>
                        <dl>
                          <div>
                            <dt>열량</dt>
                            <dd>
                              {formatNutritionValue(
                                ingredient.nutrition.energyKcal,
                                'kcal',
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>탄수화물</dt>
                            <dd>
                              {formatNutritionValue(
                                ingredient.nutrition.carbohydrateG,
                                'g',
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>단백질</dt>
                            <dd>
                              {formatNutritionValue(
                                ingredient.nutrition.proteinG,
                                'g',
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>나트륨</dt>
                            <dd>
                              {formatNutritionValue(
                                ingredient.nutrition.sodiumMg,
                                'mg',
                              )}
                            </dd>
                          </div>
                        </dl>
                        <p>
                          기준량: {ingredient.servingSize ?? '공공데이터 응답 기준'}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {mcpMetadata.notes.length > 0 ? (
                    <p className="ingredient-metadata-note">
                      {mcpMetadata.notes[0]}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="coming-soon-panel">
                  <strong>식재료를 입력해 조회해보세요.</strong>
                  <p>공공데이터포털 API 결과가 백엔드 메타데이터 계층을 거쳐 표시됩니다.</p>
                </div>
              )}
            </section>
          </section>
        ) : currentView === 'notifications' ? (
          <section className="utility-view" aria-label="알림">
            <button
              className="back-button"
              type="button"
              onClick={() => setCurrentView('board')}
            >
              게시판으로
            </button>

            <div className="utility-heading">
              <h1>알림</h1>
              <p>최근 게시판 활동을 먼저 보여주고, 알림 API는 나중에 연결합니다.</p>
            </div>

            {recentActivityItems.length === 0 ? (
              <div className="coming-soon-panel">
                <strong>아직 알림이 없습니다.</strong>
                <p>새 게시글이나 댓글 활동이 생기면 이곳에서 확인할 수 있습니다.</p>
              </div>
            ) : (
              <ul className="notification-list">
                {recentActivityItems.map((activity) => (
                  <li key={activity.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView('board')
                        loadPostDetail(activity.id)
                      }}
                    >
                      <strong>{activity.title}</strong>
                      <p>{activity.detail}</p>
                    </button>
                    <time>{activity.time}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : currentView === 'signup' ? (
          <section className="login-view signup-view" aria-label="회원가입">
            <div className="login-hero signup-hero">
              <div className="auth-brand">
                <div className="brand-mark" aria-hidden="true">
                  <span />
                </div>
                <div>
                  <strong>냉장고 파먹기</strong>
                  <p>AI 레시피 추천 커뮤니티</p>
                </div>
              </div>

              <ul className="signup-benefits" aria-label="서비스 특징">
                <li>
                  <span>AI</span>
                  <div>
                    <strong>AI 기반 레시피 추천</strong>
                    <p>가지고 있는 재료와 상황에 맞춰 오늘의 메뉴를 추천해드려요.</p>
                  </div>
                </li>
                <li>
                  <span>분석</span>
                  <div>
                    <strong>실시간 냉장고 방향</strong>
                    <p>재료를 입력하면 조합을 빠르게 떠올릴 수 있어요.</p>
                  </div>
                </li>
                <li>
                  <span>공유</span>
                  <div>
                    <strong>커뮤니티와 함께 성장</strong>
                    <p>다른 사람들의 냉장고 활용 글을 참고하고 나눌 수 있어요.</p>
                  </div>
                </li>
              </ul>

              <div className="signup-mascot" aria-hidden="true">
                <span className="pot" />
                <span className="robot-head" />
                <span className="robot-body" />
                <span className="spark spark-one" />
                <span className="spark spark-two" />
                <span className="veggie veggie-one" />
                <span className="veggie veggie-two" />
                <span className="veggie veggie-three" />
              </div>
            </div>

            <form className="login-card" onSubmit={handleSignupSubmit}>
              <div>
                <h1>회원가입</h1>
                <p>
                  이미 계정이 있다면?
                  <button
                    className="inline-link"
                    type="button"
                    onClick={() => {
                      setSignupErrorMessage('')
                      setCurrentView('login')
                    }}
                  >
                    로그인
                  </button>
                </p>
              </div>

              <label>
                이메일
                <input
                  type="email"
                  placeholder="이메일을 입력하세요"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                비밀번호
                <span className="password-field">
                  <input
                    type={isSignupPasswordVisible ? 'text' : 'password'}
                    minLength={8}
                    placeholder="비밀번호를 입력하세요"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setIsSignupPasswordVisible((isVisible) => !isVisible)
                    }
                  >
                    {isSignupPasswordVisible ? '숨김' : '보기'}
                  </button>
                </span>
              </label>

              <label>
                비밀번호 확인
                <span className="password-field">
                  <input
                    type={isSignupConfirmVisible ? 'text' : 'password'}
                    minLength={8}
                    placeholder="비밀번호를 다시 입력하세요"
                    value={signupPasswordConfirm}
                    onChange={(event) =>
                      setSignupPasswordConfirm(event.target.value)
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setIsSignupConfirmVisible((isVisible) => !isVisible)
                    }
                  >
                    {isSignupConfirmVisible ? '숨김' : '보기'}
                  </button>
                </span>
              </label>

              <label>
                닉네임
                <input
                  type="text"
                  maxLength={20}
                  placeholder="닉네임을 입력하세요 (2~10자)"
                  value={signupNickname}
                  onChange={(event) => setSignupNickname(event.target.value)}
                  required
                />
              </label>

              <p className="signup-policy">
                <span aria-hidden="true">□</span>
                이용약관 및 개인정보처리방침에 동의합니다.
              </p>

              {signupErrorMessage ? (
                <p className="login-message error">{signupErrorMessage}</p>
              ) : null}

              <button type="submit" disabled={isSignupSubmitting}>
                {isSignupSubmitting ? '가입 중' : '회원가입'}
              </button>
            </form>
          </section>
        ) : currentView === 'write' ? (
          <section className="write-view" aria-label="글 작성">
            <button className="back-button" type="button" onClick={closeWriteView}>
              목록으로
            </button>

            <div className="write-layout">
              <form className="write-card" onSubmit={handleCreatePost}>
                <div className="write-heading">
                  <h1>{editingPostId ? '게시글 수정' : '새 글 작성'}</h1>
                  <p>
                    {editingPostId
                      ? '작성한 내용을 다시 정리해보세요.'
                      : '냉장고에 있는 재료나 상황을 자세히 적어주세요.'}
                  </p>
                </div>

                <label>
                  제목
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="제목을 입력하세요"
                    value={postTitle}
                    onChange={(event) => setPostTitle(event.target.value)}
                    required
                  />
                  <span>{postTitle.length} / 200</span>
                </label>

                <label>
                  내용
                  <textarea
                    maxLength={5000}
                    placeholder="냉장고에 있는 재료와 상황을 자세히 적어주세요."
                    value={postContent}
                    onChange={(event) => setPostContent(event.target.value)}
                    required
                  />
                  <span>{postContent.length} / 5000</span>
                </label>

                <label>
                  태그
                  <input
                    type="text"
                    placeholder="쉼표로 구분해서 입력하세요. 예: 계란, 김치, 10분요리"
                    value={postTagInput}
                    onChange={(event) => setPostTagInput(event.target.value)}
                  />
                  <span>최대 5개</span>
                </label>

                {postCreateErrorMessage ? (
                  <p className="write-message error">{postCreateErrorMessage}</p>
                ) : null}

                <div className="write-actions">
                  <button type="button" onClick={closeWriteView}>
                    취소
                  </button>
                  <button type="submit" disabled={isPostCreating}>
                    {isPostCreating
                      ? editingPostId
                        ? '수정 중'
                        : '등록 중'
                      : editingPostId
                        ? '수정하기'
                        : '등록하기'}
                  </button>
                </div>
              </form>

              <aside className="write-guide-card" aria-label="작성 팁">
                <section className="post-draft-agent" aria-label="AI 작성 보조">
                  <div className="post-draft-agent-heading">
                    <h2>AI 작성 보조</h2>
                    <span>Agent</span>
                  </div>
                  <label>
                    추가 요청
                    <textarea
                      maxLength={500}
                      placeholder="예: 초보자도 답하기 쉽게, 저염 메뉴 중심으로 정리해줘"
                      value={postDraftAdditionalRequest}
                      onChange={(event) =>
                        setPostDraftAdditionalRequest(event.target.value)
                      }
                    />
                    <span>{postDraftAdditionalRequest.length} / 500</span>
                  </label>
                  <button
                    className="post-draft-agent-button"
                    type="button"
                    onClick={handlePostDraftAgentAssist}
                    disabled={isPostDraftAgentLoading}
                  >
                    {isPostDraftAgentLoading ? '분석 중' : 'AI 작성 보조'}
                  </button>

                  {postDraftAgentErrorMessage ? (
                    <p className="post-draft-agent-message error">
                      {postDraftAgentErrorMessage}
                    </p>
                  ) : null}

                  {postDraftAgentResult ? (
                    <div className="post-draft-agent-result">
                      <div className="post-draft-agent-status">
                        <strong>
                          {getPostDraftAgentStatusLabel(postDraftAgentResult.status)}
                        </strong>
                        <span>{postDraftAgentResult.message}</span>
                      </div>

                      {postDraftAgentResult.questions.length > 0 ? (
                        <div className="post-draft-agent-section">
                          <h3>더 필요한 정보</h3>
                          <ul>
                            {postDraftAgentResult.questions.map((question) => (
                              <li key={question}>{question}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {postDraftAgentResult.ingredients.length > 0 ? (
                        <div className="post-draft-agent-section">
                          <h3>추출한 재료</h3>
                          <div className="post-draft-agent-tags">
                            {postDraftAgentResult.ingredients.map((ingredient) => (
                              <span key={ingredient}>{ingredient}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {postDraftAgentResult.nutritionSummary ? (
                        <p className="post-draft-agent-nutrition">
                          {postDraftAgentResult.nutritionSummary}
                        </p>
                      ) : null}

                      {postDraftAgentResult.suggestedTitle ||
                      postDraftAgentResult.suggestedBody ? (
                        <div className="post-draft-agent-section">
                          <h3>제안 초안</h3>
                          {postDraftAgentResult.suggestedTitle ? (
                            <strong className="post-draft-agent-title">
                              {postDraftAgentResult.suggestedTitle}
                            </strong>
                          ) : null}
                          {postDraftAgentResult.suggestedBody ? (
                            <p className="post-draft-agent-body">
                              {postDraftAgentResult.suggestedBody}
                            </p>
                          ) : null}
                          {postDraftAgentResult.suggestedTags.length > 0 ? (
                            <div className="post-draft-agent-tags">
                              {postDraftAgentResult.suggestedTags.map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          ) : null}
                          <button
                            className="post-draft-agent-apply"
                            type="button"
                            onClick={applyPostDraftAgentSuggestion}
                          >
                            초안 적용
                          </button>
                        </div>
                      ) : null}

                      {postDraftAgentResult.steps.length > 0 ? (
                        <details className="post-draft-agent-steps">
                          <summary>추론 로그</summary>
                          <ol>
                            {postDraftAgentResult.steps.map((step) => (
                              <li key={`${step.index}-${step.node}-${step.status}`}>
                                <span>{step.node}</span>
                                <small>{step.message}</small>
                              </li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <h2>작성 팁</h2>
                <ul>
                  <li>가지고 있는 재료를 구체적으로 적어주세요.</li>
                  <li>조리 시간, 식사 상황, 취향을 함께 적어주면 좋아요.</li>
                  <li>특별한 요구사항이 있다면 같이 적어주세요.</li>
                </ul>
                <section className="write-example" aria-label="작성 예시">
                  <h3>예시</h3>
                  <p>
                    "냉장고에 계란, 김치, 양파가 있어요. 10분 안에 저녁으로
                    먹을 수 있는 메뉴 추천해주세요."
                  </p>
                </section>
                <div className="write-pot-illustration" aria-hidden="true">
                  <span />
                </div>
              </aside>
            </div>
          </section>
        ) : selectedPost || isDetailLoading || detailErrorMessage ? (
          <section className="detail-view">
            <button
              className="back-button"
              type="button"
              onClick={() => goBackToList()}
            >
              목록으로
            </button>

            {isDetailLoading ? (
              <div className="detail-card detail-state">게시글을 불러오는 중입니다.</div>
            ) : detailErrorMessage ? (
              <div className="detail-card detail-state error">{detailErrorMessage}</div>
            ) : selectedPost ? (
              <div className="detail-layout">
                <article className="detail-card">
                  <div className="detail-topline">
                    <h1>{selectedPost.title}</h1>
                    {currentUser?.id === selectedPost.author.id ? (
                      <div className="detail-actions">
                        <button type="button" onClick={openEditView}>
                          수정
                        </button>
                        <button
                          className="danger"
                          type="button"
                          onClick={handleDeletePost}
                          disabled={isPostDeleting}
                        >
                          {isPostDeleting ? '삭제 중' : '삭제'}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {postDeleteErrorMessage ? (
                    <p className="detail-action-message error">
                      {postDeleteErrorMessage}
                    </p>
                  ) : null}

                  <div className="detail-meta">
                    <span className="mini-avatar">
                      {selectedPost.author.nickname.slice(0, 1)}
                    </span>
                    <strong>{selectedPost.author.nickname}</strong>
                    <time dateTime={selectedPost.createdAt}>
                      {formatDate(selectedPost.createdAt)}
                    </time>
                    <span>조회 {selectedPost.viewCount}</span>
                  </div>

                  <div className="detail-tags">
                    {(selectedPost.tags ?? []).map((tag) => (
                      <span className="tag-chip green" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <p className="detail-body">{selectedPost.content}</p>

                  <section className="recipe-info" aria-label="요리 조건">
                    <div>
                      <span className="info-label">식사 상황</span>
                      <strong>저녁</strong>
                    </div>
                    <div>
                      <span className="info-label">조리 시간</span>
                      <strong>10분 이내</strong>
                    </div>
                  </section>

                  <section className="comment-box" aria-label="댓글">
                    <h2>댓글 {comments.length}</h2>
                    <form className="comment-input-row" onSubmit={handleCreateComment}>
                      <input
                        type="text"
                        placeholder="댓글을 입력하세요..."
                        value={commentContent}
                        onChange={(event) => setCommentContent(event.target.value)}
                      />
                      <button type="submit" disabled={isCommentSubmitting}>
                        {isCommentSubmitting ? '등록 중' : '등록'}
                      </button>
                    </form>

                    {commentSubmitMessage ? (
                      <p className="comment-state success">{commentSubmitMessage}</p>
                    ) : null}

                    {commentErrorMessage ? (
                      <p className="comment-state error">{commentErrorMessage}</p>
                    ) : comments.length === 0 ? (
                      <p className="comment-state">아직 댓글이 없습니다.</p>
                    ) : (
                      <ul className="comment-list">
                        {comments.map((comment) => (
                          <li key={comment.id}>
                            <span className="mini-avatar">
                              {comment.author.nickname.slice(0, 1)}
                            </span>
                            <div>
                              <div className="comment-meta">
                                <strong>{comment.author.nickname}</strong>
                                <time dateTime={comment.createdAt}>
                                  {formatDate(comment.createdAt)}
                                </time>
                                {currentUser?.id === comment.author.id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEditComment(comment)}
                                      disabled={editingCommentId === comment.id}
                                    >
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteComment(comment.id)}
                                      disabled={deletingCommentId === comment.id}
                                    >
                                      {deletingCommentId === comment.id
                                        ? '삭제 중'
                                        : '삭제'}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              {editingCommentId === comment.id ? (
                                <div className="comment-edit-row">
                                  <input
                                    type="text"
                                    maxLength={500}
                                    value={editingCommentContent}
                                    onChange={(event) =>
                                      setEditingCommentContent(event.target.value)
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateComment(comment.id)}
                                    disabled={isCommentUpdating}
                                  >
                                    {isCommentUpdating ? '저장 중' : '저장'}
                                  </button>
                                  <button type="button" onClick={cancelEditComment}>
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <p>{comment.content}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </article>

                <aside className="detail-ai-panel" aria-label="AI 추천 결과">
                  <div className="detail-ai-panel-header">
                    <span aria-hidden="true">AI</span>
                    <strong>AI 추천 결과</strong>
                  </div>
                  <span
                    className={`status-badge ${getAiRecommendationStatusClass(
                      getAiRecommendationStatusLabel(aiRecommendation?.status),
                    )}`}
                  >
                    {getAiRecommendationStatusLabel(aiRecommendation?.status)}
                  </span>
                  <h2>{aiRecommendation?.menuName ?? '냉장고 재료 활용 레시피'}</h2>
                  <div className="detail-ai-visual" aria-hidden="true">
                    <span />
                  </div>
	                  {aiRecommendation?.status === 'STALE' ? (
	                    <p className="ai-panel-message">
	                      게시글이나 댓글이 바뀌어 다시 추천을 실행할 수 있습니다.
	                    </p>
	                  ) : null}
	                  {aiRecommendation ? (
	                    <p className="ai-grounding-note">
	                      {getAiGroundingLabel(aiRecommendation.grounding)} ·{' '}
	                      {getAiGroundingMessage(aiRecommendation.grounding)}
	                    </p>
	                  ) : null}
	                  {aiRecommendation ? (
	                    <>
                      <section>
                        <h3>추천 이유</h3>
                        <p>{aiRecommendation.reason}</p>
                      </section>
                      <section>
                        <h3>부족한 재료</h3>
                        <p>
                          {aiRecommendation.missingIngredients.length > 0
                            ? aiRecommendation.missingIngredients.join(', ')
                            : '추가로 필요한 재료가 거의 없습니다.'}
                        </p>
                      </section>
                      <section>
                        <h3>AI가 참고한 댓글 답변</h3>
                        {aiRecommendation.referencedPosts.length > 0 ? (
                          <ul className="ai-reference-list">
                            {aiRecommendation.referencedPosts.map((post) => (
                              <li key={post.postId}>
                                <button
                                  type="button"
                                  onClick={() => loadPostDetail(post.postId)}
                                >
                                  {post.title}
                                </button>
                                <span>{Math.round(post.similarity * 100)}%</span>
                              </li>
                            ))}
                          </ul>
	                        ) : (
	                          <p>
	                            {aiRecommendation.grounding === 'GENERAL_AI'
	                              ? '현재 글과 일반 요리 지식을 기준으로 추천했습니다.'
	                              : '참고한 게시글이 아직 없습니다.'}
	                          </p>
	                        )}
                      </section>
                    </>
                  ) : (
                    <section>
                      <h3>추천 없음</h3>
                      <p>이 글과 비슷한 게시글을 찾아 레시피 추천을 만들 수 있습니다.</p>
                    </section>
                  )}
	                  {aiRecommendationErrorMessage ? (
	                    <p className="ai-panel-message error">
	                      {aiRecommendationErrorMessage}
	                    </p>
	                  ) : null}
                  <div className="ai-goal-selector compact" role="group" aria-label="추천 목표">
                    <span>추천 목표</span>
                    <div>
                      {aiRecommendationGoalOptions.map((option) => (
                        <button
                          className={
                            postAiRecommendationGoal === option.id
                              ? 'selected'
                              : ''
                          }
                          key={option.id}
                          type="button"
                          onClick={() => setPostAiRecommendationGoal(option.id)}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="ai-additional-request">
                    추가 요청
                    <input
                      type="text"
                      placeholder="예: 매운맛 적게, 10분 안에, 국물 없는 메뉴"
                      value={postAiAdditionalRequest}
                      onChange={(event) =>
                        setPostAiAdditionalRequest(event.target.value)
                      }
                    />
                  </label>
	                  <div className="detail-ai-actions">
	                    {aiRecommendation ? (
	                      <button
                        className="ai-secondary-action"
                        type="button"
                        onClick={openAiRecommendationResultModal}
                      >
                        AI 추천 결과 보기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={openAiRecommendationModal}
                      disabled={isAiRecommendationLoading}
                    >
                      {isAiRecommendationLoading
                        ? 'AI 추천 생성 중'
                        : aiRecommendation
                          ? 'AI 추천 다시 실행'
                          : 'AI 추천 실행'}
                    </button>
                  </div>
                </aside>
              </div>
            ) : null}
          </section>
        ) : currentView === 'searchResults' ? (
          <section className="search-results-view" aria-label="검색 결과">
            <button
              className="back-button"
              type="button"
              onClick={() => setCurrentView('board')}
            >
              게시판으로
            </button>

            <div className="search-results-card">
              <div className="search-results-heading">
                <div>
                  <span>검색 결과</span>
                  <h1>{searchKeyword.trim() || '전체 게시글'}</h1>
                </div>
                <strong>게시글 {postTotal}</strong>
              </div>

              <form className="search-results-form" onSubmit={handleSearchSubmit}>
                <label>
                  <span className="sr-only">검색어</span>
                  <input
                    type="search"
                    placeholder="게시글 제목으로 검색하세요"
                    value={searchKeyword}
                    onChange={(event) =>
                      handleSearchKeywordChange(event.target.value)
                    }
                  />
                </label>
                <button type="submit">검색</button>
              </form>

              <div className="search-result-tabs" aria-label="검색 결과 유형">
                <button className="active" type="button">
                  게시글 ({postTotal})
                </button>
                <button type="button" onClick={() => setCurrentView('tags')}>
                  태그
                </button>
                <button type="button" disabled>
                  사용자
                </button>
              </div>

              {isLoading ? (
                <p className="search-result-state">검색 결과를 불러오는 중입니다.</p>
              ) : errorMessage ? (
                <p className="search-result-state error">{errorMessage}</p>
              ) : posts.length === 0 ? (
                <p className="search-result-state">검색 결과가 없습니다.</p>
              ) : (
                <div className="search-result-list">
                  {posts.map((post) => (
                    <article className="search-result-item" key={post.id}>
                      <button
                        className="search-result-main"
                        type="button"
                        onClick={() => loadPostDetail(post.id)}
                      >
                        <span
                          className={`post-thumb search-result-thumb thumb-${post.id % 5}`}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{post.title}</strong>
                          <em>{post.tags.slice(0, 3).join(' · ') || '태그 없음'}</em>
                        </span>
                      </button>
                      <div className="search-result-meta">
                        <span>{post.author}</span>
                        <time>{post.createdAt}</time>
                        <span>댓글 {post.comments}</span>
                        <span
                          className={`status-badge ${getAiRecommendationStatusClass(post.aiStatus)}`}
                        >
                          {post.aiStatus}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="pagination search-pagination" aria-label="검색 결과 페이지 이동">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
                >
                  이전
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (pageNumber) => (
                    <button
                      className={pageNumber === page ? 'current' : ''}
                      type="button"
                      key={pageNumber}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  다음
                </button>
              </div>
            </div>
          </section>
        ) : (
        <div className="content-grid">
          <aside className="home-sidebar" aria-label="홈 메뉴">
            <button
              type="button"
              onClick={() => {
                setCurrentView('board')
                setSelectedPost(null)
              }}
            >
              <span aria-hidden="true">⌂</span>
              홈
            </button>
            <button className="active" type="button">
              <span aria-hidden="true">▣</span>
              게시판
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView('tags')
                setSelectedPost(null)
              }}
            >
              <span aria-hidden="true">◇</span>
              태그
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView('aiGuide')
                setSelectedPost(null)
              }}
            >
              <span aria-hidden="true">✧</span>
              AI 추천
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView('mcpCheck')
                setSelectedPost(null)
              }}
            >
              <span aria-hidden="true">◎</span>
              MCP 확인
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView('aiGuide')
                setSelectedPost(null)
              }}
            >
              <span aria-hidden="true">?</span>
              가이드
            </button>
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  setCurrentView('login')
                } else {
                  openMyPage()
                }
              }}
            >
              <span aria-hidden="true">♙</span>
              마이페이지
            </button>
          </aside>

          <section className="board-main">
            <div className="board-heading">
              <div>
                <h1>최신 게시글</h1>
                <p>냉장고 속 재료로 만든 요리 고민을 빠르게 확인해보세요.</p>
              </div>
              <button className="write-button" type="button" onClick={openWriteView}>
                글쓰기
              </button>
            </div>

            <div className="category-row" aria-label="태그 카테고리">
              {categories.map((category) => (
                <button
                  className={category === activeCategory ? 'selected' : ''}
                  key={category}
                  type="button"
                  onClick={() => handleCategoryChange(category)}
                >
                  {category}
                </button>
              ))}
              <button type="button" onClick={() => setCurrentView('tags')}>
                더보기
              </button>
            </div>

            <div className="filter-row">
              <span className="select-button sort-label" aria-label="목록 정렬">
                최신순
              </span>
              <form className="board-search" onSubmit={handleSearchSubmit}>
                <span className="sr-only">목록 검색</span>
                <input
                  type="search"
                  placeholder="게시글 제목으로 검색"
                  value={searchKeyword}
                  onChange={(event) => handleSearchKeywordChange(event.target.value)}
                />
                <button className="search-icon-button" type="submit" aria-label="검색">
                  검색
                </button>
              </form>
            </div>

            <div className="post-table" role="table" aria-label="게시글 목록">
              <div className="table-row table-head" role="row">
                <span role="columnheader">제목</span>
                <span role="columnheader">태그</span>
                <span role="columnheader">작성자</span>
                <span role="columnheader">댓글</span>
                <span role="columnheader">AI 추천</span>
                <span role="columnheader">작성일</span>
              </div>

              {isLoading ? (
                <div className="empty-row">게시글을 불러오는 중입니다.</div>
              ) : errorMessage ? (
                <div className="empty-row error">{errorMessage}</div>
              ) : posts.length === 0 ? (
                <div className="empty-row">조건에 맞는 게시글이 없습니다.</div>
              ) : (
                posts.map((post) => (
                <article className="table-row" key={post.id} role="row">
                  <button
                    className="post-title"
                    type="button"
                    role="cell"
                    onClick={() => loadPostDetail(post.id)}
                  >
                    <span className={`post-thumb thumb-${post.id % 5}`} aria-hidden="true" />
                    <span>{post.title}</span>
                  </button>
                  <div className="tag-stack" role="cell">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span className="tag-chip" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="author-cell" role="cell">
                    <span className="mini-avatar">{post.author.slice(0, 1)}</span>
                    <span className="author-name">{post.author}</span>
                  </span>
                  <span role="cell">{post.comments}</span>
                  <span
                    className={`status-badge ${getAiRecommendationStatusClass(post.aiStatus)}`}
                    role="cell"
                  >
                    {post.aiStatus}
                  </span>
                  <time dateTime={post.createdAt} role="cell">
                    {post.createdAt}
                  </time>
                </article>
                ))
              )}
            </div>

            <div className="pagination" aria-label="페이지 이동">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  className={pageNumber === page ? 'current' : ''}
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((currentPage) => currentPage + 1)}
              >
                다음
              </button>
            </div>
          </section>
        </div>
        )}
        {aiModalState !== 'closed' ? (
          <div className="ai-modal-backdrop">
            {aiModalState === 'running' ? (
              <section
                className="ai-modal ai-modal-running"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-running-title"
              >
                <div className="ai-modal-kicker">
                  <span aria-hidden="true">AI</span>
                  <button
                    className="ai-modal-close"
                    type="button"
                    onClick={closeAiRecommendationModal}
                    aria-label="AI 추천 창 닫기"
                  >
                    x
                  </button>
                </div>
                <h2 id="ai-running-title">AI 추천 실행</h2>
	                <p>
	                  {aiTargetTitle}에 맞는 재료 조합과 조리 흐름을 정리하고
	                  있어요.
	                </p>
                <p className="ai-modal-source">
                  추천 목표: {getAiRecommendationGoalLabel(postAiRecommendationGoal)}
                </p>
                {postAiAdditionalRequest.trim() ? (
                  <p className="ai-modal-source">
                    추가 요청: {postAiAdditionalRequest.trim()}
                  </p>
                ) : null}

                <ol className="ai-step-list">
                  {aiRecommendationSteps.map((step, index) => (
                    <li
                      className={aiProgress >= (index + 1) * 24 ? 'active' : ''}
                      key={step}
                    >
                      <span>{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>

                <div
                  className="ai-progress"
                  role="progressbar"
                  aria-label="AI 추천 진행률"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={aiProgress}
                >
                  <span style={{ width: `${aiProgress}%` }} />
                </div>

                <button
                  className="ai-secondary-button"
                  type="button"
                  onClick={closeAiRecommendationModal}
                >
                  취소
                </button>
              </section>
            ) : (
              <section
                className="ai-modal ai-modal-result"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-result-title"
              >
                <div className="ai-modal-kicker">
                  <span aria-hidden="true">AI</span>
                  <button
                    className="ai-modal-close"
                    type="button"
                    onClick={closeAiRecommendationModal}
                    aria-label="AI 추천 결과 닫기"
                  >
                    x
                  </button>
                </div>
                <h2 id="ai-result-title">AI 추천 결과</h2>
	                <p className="ai-modal-source">{aiTargetTitle}</p>
                <p className="ai-modal-source">
                  추천 목표: {getAiRecommendationGoalLabel(postAiRecommendationGoal)}
                </p>
                {postAiAdditionalRequest.trim() ? (
                  <p className="ai-modal-source">
                    추가 요청: {postAiAdditionalRequest.trim()}
                  </p>
                ) : null}

                <div className="ai-result-summary">
                  <div className="ai-result-visual" aria-hidden="true">
                    <span />
                  </div>
                  <div>
                    <strong>
                      {aiRecommendation?.menuName ?? '냉장고 재료 활용 레시피'}
                    </strong>
                    <p>
                      {aiRecommendation?.reason ??
                        '게시글의 재료와 상황을 기준으로 만들기 쉬운 메뉴를 추천합니다.'}
                    </p>
                  </div>
                </div>

                <dl className="ai-result-facts">
                  <div>
                    <dt>조리 시간</dt>
                    <dd>
                      {aiRecommendation?.estimatedCookingTime
                        ? `${aiRecommendation.estimatedCookingTime}분`
                        : '상황에 따라 조정'}
                    </dd>
                  </div>
	                  <div>
	                    <dt>난이도</dt>
	                    <dd>{aiRecommendation?.difficulty ?? '쉬움'}</dd>
	                  </div>
	                  <div>
	                    <dt>추천 근거</dt>
	                    <dd>{getAiGroundingLabel(aiRecommendation?.grounding)}</dd>
	                  </div>
	                  <div>
	                    <dt>부족 재료</dt>
                    <dd>
                      {aiRecommendation?.missingIngredients.length
                        ? aiRecommendation.missingIngredients.join(', ')
                        : '없음'}
                    </dd>
                  </div>
                </dl>

                {aiRecommendation ? (
	                  <section className="ai-modal-detail">
	                    <h3>추천 내용</h3>
	                    <p className="ai-grounding-note">
	                      {getAiGroundingMessage(aiRecommendation.grounding)}
	                    </p>
	                    <p>{aiRecommendation.content}</p>
                    <h3>AI가 참고한 댓글 답변</h3>
                    {aiRecommendation.referencedPosts.length > 0 ? (
                      <ul className="ai-reference-list">
                        {aiRecommendation.referencedPosts.map((post) => (
                          <li key={post.postId}>
                            <button
                              type="button"
                              onClick={() => {
                                closeAiRecommendationModal()
                                loadPostDetail(post.postId)
                              }}
                            >
                              {post.title}
                            </button>
                            <span>{Math.round(post.similarity * 100)}%</span>
                          </li>
                        ))}
                      </ul>
	                    ) : (
	                      <p>
	                        {aiRecommendation.grounding === 'GENERAL_AI'
	                          ? '현재 글과 일반 요리 지식을 기준으로 추천했습니다.'
	                          : '참고한 게시글이 아직 없습니다.'}
	                      </p>
	                    )}
                  </section>
                ) : null}

                <button
                  className="ai-primary-button"
                  type="button"
                  onClick={closeAiRecommendationModal}
                >
                  상세에서 추천 결과 보기
                </button>
                <button
                  className="ai-secondary-button"
                  type="button"
                  onClick={closeAiRecommendationModal}
                >
                  닫기
                </button>
              </section>
            )}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
