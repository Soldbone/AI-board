/* eslint-disable react-hooks/set-state-in-effect */
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  getAgentPlaceRecommendation,
  type AgentPlaceRecommendationResponse,
} from './api/agentApi'
import { getSimilarPosts, type SimilarPostItem } from './api/aiApi'
import { getMe, login, signup, type UserResponse } from './api/authApi'
import { createComment, deleteComment, getComments, type CommentRead } from './api/commentApi'
import {
  createPost,
  deletePost,
  getPost,
  getPosts,
  updatePost,
  type PostFormPayload,
  type PostListItem,
  type PostRead,
  type PostSort,
  type PostTypeFilter,
} from './api/postApi'
import {
  getTagSuggestions,
  type TagSuggestion,
} from './api/tagApi'
import { updateMe } from './api/usersApi'
import { LoginPage } from './pages/LoginPage'
import { MyPage } from './pages/MyPage'
import { PostDetailPage } from './pages/PostDetailPage'
import { PostFormPage } from './pages/PostFormPage'
import { PostListPage } from './pages/PostListPage'
import { SignupPage } from './pages/SignupPage'
import { getAccessToken, removeAccessToken, saveAccessToken } from './utils/tokenStorage'

type ViewMode = 'list' | 'login' | 'signup' | 'detail' | 'create' | 'edit' | 'profile'
type HistoryMode = 'push' | 'replace' | 'none'
type LocalBoardHistoryState = {
  localBoardView?: ViewMode
  postId?: number
}

type AuthFormState = { email: string; password: string; nickname: string }
type ProfileFormState = { nickname: string; bio: string }
type PostFormState = {
  title: string
  content: string
  region: string
  store_name: string
  category: string
  post_type: 'question' | 'review'
  tag_names: string
}

const emptyAuthForm: AuthFormState = { email: '', password: '', nickname: '' }
const emptyProfileForm: ProfileFormState = { nickname: '', bio: '' }
const emptyPostForm: PostFormState = {
  title: '',
  content: '',
  region: '',
  store_name: '',
  category: '',
  post_type: 'question',
  tag_names: '',
}

const viewModes: ViewMode[] = ['list', 'login', 'signup', 'detail', 'create', 'edit', 'profile']

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && viewModes.includes(value as ViewMode)
}

function readLocalBoardHistoryState(state: unknown): LocalBoardHistoryState {
  if (!state || typeof state !== 'object') {
    return { localBoardView: 'list' }
  }

  const historyState = state as LocalBoardHistoryState
  return {
    localBoardView: isViewMode(historyState.localBoardView)
      ? historyState.localBoardView
      : 'list',
    postId: typeof historyState.postId === 'number' ? historyState.postId : undefined,
  }
}

function updateBrowserHistory(view: ViewMode, mode: HistoryMode, postId?: number) {
  if (mode === 'none' || typeof window === 'undefined') {
    return
  }

  const state: LocalBoardHistoryState = { localBoardView: view, postId }
  if (mode === 'replace') {
    window.history.replaceState(state, '', window.location.href)
    return
  }

  window.history.pushState(state, '', window.location.href)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}

function toNullable(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseTagNames(value: string) {
  return value.split(',').map((tagName) => tagName.trim()).filter(Boolean)
}

function buildPostPayload(form: PostFormState): PostFormPayload {
  return {
    title: form.title.trim(),
    content: form.content.trim(),
    region: form.region.trim(),
    store_name: toNullable(form.store_name),
    category: toNullable(form.category),
    post_type: form.post_type,
    tag_names: parseTagNames(form.tag_names),
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR')
}

function buildDetailSimilarTagNames(post: PostRead) {
  return [post.region, post.store_name, post.category].filter(
    (value): value is string => Boolean(value),
  )
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [authForm, setAuthForm] = useState<AuthFormState>(emptyAuthForm)
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken())
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm)

  const [posts, setPosts] = useState<PostListItem[]>([])
  const [selectedPost, setSelectedPost] = useState<PostRead | null>(null)
  const [comments, setComments] = useState<CommentRead[]>([])
  const [tags, setTags] = useState<TagSuggestion[]>([])
  const [agentRecommendation, setAgentRecommendation] =
    useState<AgentPlaceRecommendationResponse | null>(null)
  const [detailSimilarPosts, setDetailSimilarPosts] = useState<SimilarPostItem[]>([])
  const [detailSimilarPostMessage, setDetailSimilarPostMessage] = useState('')

  const [postForm, setPostForm] = useState<PostFormState>(emptyPostForm)
  const [commentContent, setCommentContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null)

  const [keywordInput, setKeywordInput] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [activePostType, setActivePostType] = useState<PostTypeFilter>('all')
  const [activeSort, setActiveSort] = useState<PostSort>('latest')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [message, setMessage] = useState('게시글 목록을 불러오는 중입니다.')
  const [isLoading, setIsLoading] = useState(true)
  const [isAgentLoading, setIsAgentLoading] = useState(false)
  const [isDetailSimilarPostLoading, setIsDetailSimilarPostLoading] = useState(false)

  const hasAccessToken = Boolean(accessToken)

  const loadTags = useCallback(async () => {
    try {
      setTags(await getTagSuggestions(10))
    } catch {
      setTags([])
    }
  }, [])

  const loadCurrentUser = useCallback(async (token: string) => {
    try {
      const user = await getMe(token)
      setCurrentUser(user)
      setProfileForm({ nickname: user.nickname, bio: user.bio ?? '' })
    } catch (error) {
      removeAccessToken()
      setAccessToken(null)
      setCurrentUser(null)
      setMessage(getErrorMessage(error))
    }
  }, [])

  const loadPosts = useCallback(
    async (
      nextPage = 1,
      filters: {
        keyword?: string
        tag?: string
        postType?: PostTypeFilter
        sort?: PostSort
      } = {},
    ) => {
      const keyword = filters.keyword ?? activeKeyword
      const tag = filters.tag ?? activeTag
      const postType = filters.postType ?? activePostType
      const sort = filters.sort ?? activeSort

      setIsLoading(true)
      setMessage('게시글 목록을 불러오는 중입니다.')

      try {
        const data = await getPosts({
          page: nextPage,
          size: 10,
          keyword: keyword || undefined,
          tag: tag || undefined,
          post_type: postType === 'all' ? undefined : postType,
          sort,
        })
        setPosts(data.items)
        setPage(data.page)
        setTotalCount(data.total_count)
        setTotalPages(data.total_pages)
        setMessage('')
      } catch (error) {
        setMessage(getErrorMessage(error))
      } finally {
        setIsLoading(false)
      }
    },
    [activeKeyword, activeTag, activePostType, activeSort],
  )

  async function loadDetailSimilarPosts(post: PostRead) {
    setIsDetailSimilarPostLoading(true)
    setDetailSimilarPostMessage('비슷한 게시글을 찾는 중입니다.')

    try {
      const data = await getSimilarPosts({
        title: post.title,
        content: post.content,
        store_name: post.store_name,
        tag_names: buildDetailSimilarTagNames(post),
        limit: 5,
        exclude_post_id: post.id,
      })

      setDetailSimilarPosts(data.items)
      setDetailSimilarPostMessage(data.items.length ? '' : '비슷한 게시글이 없습니다.')
    } catch (error) {
      setDetailSimilarPosts([])
      setDetailSimilarPostMessage(
        error instanceof Error ? error.message : '비슷한 게시글을 찾지 못했습니다.',
      )
    } finally {
      setIsDetailSimilarPostLoading(false)
    }
  }

  useEffect(() => {
    void loadPosts(1, { keyword: '', tag: '', postType: 'all', sort: 'latest' })
    void loadTags()
  }, [loadPosts, loadTags])

  useEffect(() => {
    if (accessToken) void loadCurrentUser(accessToken)
  }, [accessToken, loadCurrentUser])

  function updateAuthForm(field: keyof AuthFormState, value: string) {
    setAuthForm((prevForm) => ({ ...prevForm, [field]: value }))
  }

  function updatePostForm(field: keyof PostFormState, value: string) {
    setPostForm((prevForm) => ({ ...prevForm, [field]: value }))
  }

  function updateProfileForm(field: keyof ProfileFormState, value: string) {
    setProfileForm((prevForm) => ({ ...prevForm, [field]: value }))
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = authForm.email.trim()
    const password = authForm.password.trim()

    if (!email || !password) {
      setMessage('이메일과 비밀번호를 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('로그인 중입니다.')

    try {
      const tokenData = await login({ email, password })
      saveAccessToken(tokenData.access_token)
      setAccessToken(tokenData.access_token)
      setAuthForm(emptyAuthForm)
      goList('replace')
      setMessage('로그인했습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = authForm.email.trim()
    const password = authForm.password.trim()
    const nickname = authForm.nickname.trim()

    if (!email || !password || !nickname) {
      setMessage('이메일, 비밀번호, 닉네임을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('회원가입 중입니다.')

    try {
      await signup({ email, password, nickname })
      const tokenData = await login({ email, password })
      saveAccessToken(tokenData.access_token)
      setAccessToken(tokenData.access_token)
      setAuthForm(emptyAuthForm)
      goList('replace')
      setMessage('회원가입 후 로그인했습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  function handleLogout() {
    removeAccessToken()
    setAccessToken(null)
    setCurrentUser(null)
    setProfileForm(emptyProfileForm)
    goList('replace')
    setMessage('로그아웃했습니다.')
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      setMessage('마이페이지 수정은 로그인이 필요합니다.')
      return
    }

    const nickname = profileForm.nickname.trim()
    if (!nickname) {
      setMessage('닉네임을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('내 정보를 수정하는 중입니다.')

    try {
      const user = await updateMe({ nickname, bio: profileForm.bio.trim() || null }, accessToken)
      setCurrentUser(user)
      setProfileForm({ nickname: user.nickname, bio: user.bio ?? '' })
      setMessage('내 정보를 수정했습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function openDetail(postId: number, historyMode: HistoryMode = 'push') {
    updateBrowserHistory('detail', historyMode, postId)
    setViewMode('detail')
    setSelectedPost(null)
    setComments([])
    setAgentRecommendation(null)
    setDetailSimilarPosts([])
    setDetailSimilarPostMessage('')
    setReplyTargetId(null)
    setCommentContent('')
    setIsAnonymous(false)
    setIsLoading(true)
    setMessage('게시글 상세와 댓글을 불러오는 중입니다.')

    try {
      const [postData, commentData] = await Promise.all([getPost(postId), getComments(postId)])
      setSelectedPost(postData)
      setComments(commentData)
      setMessage('')
      void loadDetailSimilarPosts(postData)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateForm() {
    if (!accessToken) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('글쓰기는 로그인이 필요합니다.')
      return
    }

    setPostForm(emptyPostForm)
    setSelectedPost(null)
    setComments([])
    setAgentRecommendation(null)
    setDetailSimilarPosts([])
    setDetailSimilarPostMessage('')
    setReplyTargetId(null)
    setCommentContent('')
    setIsAnonymous(false)
    updateBrowserHistory('create', 'push')
    setViewMode('create')
    setMessage('')
  }

  function openEditForm() {
    if (!selectedPost) return
    if (!accessToken) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('게시글 수정은 로그인이 필요합니다.')
      return
    }

    setPostForm({
      title: selectedPost.title,
      content: selectedPost.content,
      region: selectedPost.region ?? '',
      store_name: selectedPost.store_name ?? '',
      category: selectedPost.category ?? '',
      post_type: selectedPost.post_type,
      tag_names: '',
    })
    updateBrowserHistory('edit', 'push', selectedPost.id)
    setViewMode('edit')
    setMessage('')
  }

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('글쓰기는 로그인이 필요합니다.')
      return
    }

    const payload = buildPostPayload(postForm)
    if (!payload.title || !payload.content) {
      setMessage('제목과 내용을 입력해주세요.')
      return
    }

    if (!payload.region) {
      setMessage('지역을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('게시글을 등록하는 중입니다.')

    try {
      const createdPost = await createPost(payload, accessToken)
      await loadPosts(1, {
        keyword: activeKeyword,
        tag: activeTag,
        postType: activePostType,
        sort: activeSort,
      })
      await loadTags()
      setSelectedPost(createdPost)
      setComments([])
      setAgentRecommendation(null)
      setDetailSimilarPosts([])
      setDetailSimilarPostMessage('')
      void loadDetailSimilarPosts(createdPost)
      updateBrowserHistory('detail', 'replace', createdPost.id)
      setViewMode('detail')
      setMessage('게시글을 등록했습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUpdatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !selectedPost) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('게시글 수정은 로그인이 필요합니다.')
      return
    }

    const payload = buildPostPayload(postForm)
    if (!payload.title || !payload.content) {
      setMessage('제목과 내용을 입력해주세요.')
      return
    }

    if (!payload.region) {
      setMessage('지역을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('게시글을 수정하는 중입니다.')

    try {
      const updatedPost = await updatePost(selectedPost.id, payload, accessToken)
      await loadPosts(page, {
        keyword: activeKeyword,
        tag: activeTag,
        postType: activePostType,
        sort: activeSort,
      })
      setSelectedPost(updatedPost)
      setAgentRecommendation(null)
      setDetailSimilarPosts([])
      setDetailSimilarPostMessage('')
      void loadDetailSimilarPosts(updatedPost)
      updateBrowserHistory('detail', 'replace', updatedPost.id)
      setViewMode('detail')
      setMessage('게시글을 수정했습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !selectedPost) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('댓글 작성은 로그인이 필요합니다.')
      return
    }

    if (!commentContent.trim()) {
      setMessage('댓글 내용을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('댓글을 등록하는 중입니다.')

    try {
      await createComment(
        selectedPost.id,
        { content: commentContent.trim(), is_anonymous: isAnonymous, parent_id: replyTargetId },
        accessToken,
      )
      const nextComments = await getComments(selectedPost.id)
      setComments(nextComments)
      setCommentContent('')
      setIsAnonymous(false)
      setReplyTargetId(null)
      setMessage('댓글을 등록했습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeletePost() {
    if (!accessToken || !selectedPost) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('게시글 삭제는 로그인이 필요합니다.')
      return
    }

    if (!window.confirm('게시글을 삭제할까요?')) {
      return
    }

    setIsLoading(true)
    setMessage('게시글을 삭제하는 중입니다.')

    try {
      await deletePost(selectedPost.id, accessToken)
      await loadPosts(1, {
        keyword: activeKeyword,
        tag: activeTag,
        postType: activePostType,
        sort: activeSort,
      })
      await loadTags()
      goList('replace')
      setMessage('게시글을 삭제했습니다.')
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      window.alert(errorMessage)
      setMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!accessToken || !selectedPost) {
      updateBrowserHistory('login', 'push')
      setViewMode('login')
      setMessage('댓글 삭제는 로그인이 필요합니다.')
      return
    }

    if (!window.confirm('댓글을 삭제할까요?')) {
      return
    }

    setIsLoading(true)
    setMessage('댓글을 삭제하는 중입니다.')

    try {
      await deleteComment(commentId, accessToken)
      const nextComments = await getComments(selectedPost.id)
      setComments(nextComments)
      setMessage('댓글을 삭제했습니다.')
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      window.alert(errorMessage)
      setMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAgentRecommendation() {
    if (!selectedPost) return

    if (!selectedPost.region) {
      setMessage('AI 장소 추천은 게시글의 지역 정보가 필요합니다.')
      return
    }

    setIsAgentLoading(true)
    setMessage('AI가 장소를 추천하는 중입니다.')

    try {
      const recommendation = await getAgentPlaceRecommendation({
        region: selectedPost.region,
        title: selectedPost.title,
        content: selectedPost.content,
        keyword: selectedPost.store_name ?? selectedPost.category ?? null,
        display: 3,
      })
      setAgentRecommendation(recommendation)
      setMessage('AI 장소 추천을 불러왔습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsAgentLoading(false)
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextKeyword = keywordInput.trim()
    setActiveKeyword(nextKeyword)
    void loadPosts(1, {
      keyword: nextKeyword,
      tag: activeTag,
      postType: activePostType,
      sort: activeSort,
    })
  }

  function selectSuggestion(suggestion: TagSuggestion) {
    const nextTag = activeTag === suggestion.name ? '' : suggestion.name

    setActiveTag(nextTag)
    setActiveKeyword('')
    setKeywordInput('')
    void loadPosts(1, {
      keyword: '',
      tag: nextTag,
      postType: activePostType,
      sort: activeSort,
    })
  }

  function changeSort(nextSort: PostSort) {
    setActiveSort(nextSort)
    void loadPosts(1, {
      keyword: activeKeyword,
      tag: activeTag,
      postType: activePostType,
      sort: nextSort,
    })
  }

  function changePostType(nextPostType: PostTypeFilter) {
    setActivePostType(nextPostType)
    void loadPosts(1, {
      keyword: activeKeyword,
      tag: activeTag,
      postType: nextPostType,
      sort: activeSort,
    })
  }

  function clearFilters() {
    setKeywordInput('')
    setActiveKeyword('')
    setActiveTag('')
    setActivePostType('all')
    void loadPosts(1, { keyword: '', tag: '', postType: 'all', sort: activeSort })
  }

  function goList(historyMode: HistoryMode = 'replace') {
    updateBrowserHistory('list', historyMode)
    setViewMode('list')
    setSelectedPost(null)
    setComments([])
    setAgentRecommendation(null)
    setDetailSimilarPosts([])
    setDetailSimilarPostMessage('')
    setMessage('')
  }

  useEffect(() => {
    updateBrowserHistory('list', 'replace')

    function handlePopState(event: PopStateEvent) {
      const historyState = readLocalBoardHistoryState(event.state)

      if (historyState.localBoardView === 'detail' && historyState.postId) {
        void openDetail(historyState.postId, 'none')
        return
      }

      if (historyState.localBoardView === 'list' || !historyState.localBoardView) {
        goList('none')
        return
      }

      setViewMode(historyState.localBoardView)
      setMessage('')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function renderHeaderActions() {
    if (currentUser) {
      return (
        <>
          <span className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            {currentUser.nickname}님
          </span>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { updateBrowserHistory('profile', 'push'); setViewMode('profile'); setMessage('') }} type="button">
            마이페이지
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={handleLogout} type="button">
            로그아웃
          </button>
        </>
      )
    }

    return (
      <>
        <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { updateBrowserHistory('login', 'push'); setViewMode('login'); setMessage('') }} type="button">
          로그인
        </button>
        <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { updateBrowserHistory('signup', 'push'); setViewMode('signup'); setMessage('') }} type="button">
          회원가입
        </button>
      </>
    )
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef7f2_48%,#f8fafc_100%)] px-4 py-8 pt-44 md:px-6 md:pt-32">
      <section className="mx-auto max-w-6xl">
        <header className="fixed top-0 left-0 z-50 w-full border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button className="text-left" onClick={() => goList('replace')} type="button">
                <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Local Board
                </span>
                <h1 className="mt-1 text-3xl font-bold text-slate-950 md:text-4xl">여기저기</h1>
                <p className="mt-1 text-xs text-slate-500 md:text-sm">
                  우리동네 솔직 리뷰 게시판 · 전체 {totalCount}개
                </p>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {renderHeaderActions()}
                <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { goList('replace'); void loadPosts(page, { postType: activePostType, sort: activeSort }) }} type="button">
                  목록
                </button>
                <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!hasAccessToken} onClick={openCreateForm} type="button">
                  글쓰기
                </button>
              </div>
            </div>
          </div>
        </header>

        {message && <div className="mb-4 rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">{message}</div>}

        {viewMode === 'list' && (
          <PostListPage
            activeTag={activeTag}
            activeKeyword={activeKeyword}
            activePostType={activePostType}
            formatDate={formatDate}
            isLoading={isLoading}
            keywordInput={keywordInput}
            onClearFilters={clearFilters}
            onKeywordInputChange={setKeywordInput}
            onLoadPage={(nextPage) => void loadPosts(nextPage, { postType: activePostType, sort: activeSort })}
            onOpenDetail={(postId) => void openDetail(postId)}
            onSearchSubmit={handleSearchSubmit}
            onSelectSuggestion={selectSuggestion}
            onPostTypeChange={changePostType}
            onSortChange={changeSort}
            page={page}
            posts={posts}
            sort={activeSort}
            tags={tags}
            totalPages={totalPages}
          />
        )}

        {viewMode === 'login' && (
          <LoginPage
            form={{ email: authForm.email, password: authForm.password }}
            isLoading={isLoading}
            onChange={updateAuthForm}
            onGoSignup={() => { updateBrowserHistory('signup', 'replace'); setViewMode('signup'); setMessage('') }}
            onSubmit={handleLoginSubmit}
          />
        )}

        {viewMode === 'signup' && (
          <SignupPage
            form={authForm}
            isLoading={isLoading}
            onChange={updateAuthForm}
            onGoLogin={() => { updateBrowserHistory('login', 'replace'); setViewMode('login'); setMessage('') }}
            onSubmit={handleSignupSubmit}
          />
        )}

        {viewMode === 'detail' && (
          <PostDetailPage
            commentContent={commentContent}
            comments={comments}
            agentRecommendation={agentRecommendation}
            similarPosts={detailSimilarPosts}
            similarPostMessage={detailSimilarPostMessage}
            formatDate={formatDate}
            hasAccessToken={hasAccessToken}
            isAnonymous={isAnonymous}
            isAgentLoading={isAgentLoading}
            isSimilarPostLoading={isDetailSimilarPostLoading}
            isLoading={isLoading}
            currentUserId={currentUser?.id ?? null}
            onAnonymousChange={setIsAnonymous}
            onBack={goList}
            onCancelReply={() => setReplyTargetId(null)}
            onCommentContentChange={setCommentContent}
            onCreateComment={handleCreateComment}
            onDeleteComment={handleDeleteComment}
            onDeletePost={handleDeletePost}
            onEdit={openEditForm}
            onRequestAgentRecommendation={handleAgentRecommendation}
            onOpenSimilarPost={(postId) => void openDetail(postId)}
            onReplyTargetChange={(commentId) => { setReplyTargetId(commentId); setMessage('') }}
            post={selectedPost}
            replyTargetId={replyTargetId}
          />
        )}

        {(viewMode === 'create' || viewMode === 'edit') && (
          <PostFormPage
            form={postForm}
            isLoading={isLoading}
            mode={viewMode}
            onCancel={() => {
              if (selectedPost) {
                updateBrowserHistory('detail', 'replace', selectedPost.id)
                setViewMode('detail')
              } else {
                goList('replace')
              }
              setMessage('')
            }}
            onChange={updatePostForm}
            onOpenSimilarPost={(postId) => void openDetail(postId)}
            onSubmit={viewMode === 'create' ? handleCreatePost : handleUpdatePost}
          />
        )}

        {viewMode === 'profile' && (
          <MyPage
            currentUser={currentUser}
            isLoading={isLoading}
            onChange={updateProfileForm}
            onSubmit={handleProfileSubmit}
            profileForm={profileForm}
          />
        )}
      </section>
    </main>
  )
}

export default App
