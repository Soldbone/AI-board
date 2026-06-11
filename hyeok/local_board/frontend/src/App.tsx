/* eslint-disable react-hooks/set-state-in-effect */
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { getMe, login, signup, type UserResponse } from './api/authApi'
import { createComment, getComments, type CommentRead } from './api/commentApi'
import {
  createPost,
  getPost,
  getPosts,
  updatePost,
  type PostFormPayload,
  type PostListItem,
  type PostRead,
} from './api/postApi'
import { getTags, type TagRead } from './api/tagApi'
import { updateMe } from './api/usersApi'
import { getAccessToken, removeAccessToken, saveAccessToken } from './utils/tokenStorage'

type ViewMode = 'list' | 'detail' | 'create' | 'edit' | 'profile'
type AuthMode = 'login' | 'signup'

type AuthFormState = { email: string; password: string; nickname: string }
type ProfileFormState = { nickname: string; bio: string }
type PostFormState = {
  title: string
  content: string
  region: string
  store_name: string
  category: string
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
  tag_names: '',
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
    region: toNullable(form.region),
    store_name: toNullable(form.store_name),
    category: toNullable(form.category),
    tag_names: parseTagNames(form.tag_names),
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR')
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authForm, setAuthForm] = useState<AuthFormState>(emptyAuthForm)
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken())
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm)

  const [posts, setPosts] = useState<PostListItem[]>([])
  const [selectedPost, setSelectedPost] = useState<PostRead | null>(null)
  const [comments, setComments] = useState<CommentRead[]>([])
  const [tags, setTags] = useState<TagRead[]>([])

  const [postForm, setPostForm] = useState<PostFormState>(emptyPostForm)
  const [commentContent, setCommentContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null)

  const [keywordInput, setKeywordInput] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [message, setMessage] = useState('게시글 목록을 불러오는 중입니다.')
  const [isLoading, setIsLoading] = useState(true)

  const hasAccessToken = Boolean(accessToken)

  const loadTags = useCallback(async () => {
    try {
      setTags(await getTags())
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
    async (nextPage = 1, filters: { keyword?: string; tag?: string } = {}) => {
      const keyword = filters.keyword ?? activeKeyword
      const tag = filters.tag ?? activeTag

      setIsLoading(true)
      setMessage('게시글 목록을 불러오는 중입니다.')

      try {
        const data = await getPosts({
          page: nextPage,
          size: 10,
          keyword: keyword || undefined,
          tag: tag || undefined,
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
    [activeKeyword, activeTag],
  )

  useEffect(() => {
    void loadPosts(1, { keyword: '', tag: '' })
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

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = authForm.email.trim()
    const password = authForm.password.trim()
    const nickname = authForm.nickname.trim()

    if (!email || !password || (authMode === 'signup' && !nickname)) {
      setMessage('이메일, 비밀번호, 닉네임을 확인해주세요.')
      return
    }

    setIsLoading(true)
    setMessage(authMode === 'login' ? '로그인 중입니다.' : '회원가입 중입니다.')

    try {
      if (authMode === 'signup') await signup({ email, password, nickname })
      const tokenData = await login({ email, password })
      saveAccessToken(tokenData.access_token)
      setAccessToken(tokenData.access_token)
      setAuthForm(emptyAuthForm)
      setMessage(authMode === 'login' ? '로그인했습니다.' : '회원가입 후 로그인했습니다.')
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
    setViewMode('list')
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

  async function openDetail(postId: number) {
    setViewMode('detail')
    setSelectedPost(null)
    setComments([])
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
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateForm() {
    if (!accessToken) {
      setMessage('글쓰기는 로그인이 필요합니다.')
      return
    }
    setPostForm(emptyPostForm)
    setSelectedPost(null)
    setComments([])
    setReplyTargetId(null)
    setCommentContent('')
    setIsAnonymous(false)
    setViewMode('create')
    setMessage('')
  }

  function openEditForm() {
    if (!selectedPost) return
    if (!accessToken) {
      setMessage('게시글 수정은 로그인이 필요합니다.')
      return
    }
    setPostForm({
      title: selectedPost.title,
      content: selectedPost.content,
      region: selectedPost.region ?? '',
      store_name: selectedPost.store_name ?? '',
      category: selectedPost.category ?? '',
      tag_names: '',
    })
    setViewMode('edit')
    setMessage('')
  }

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      setMessage('글쓰기는 로그인이 필요합니다.')
      return
    }

    const payload = buildPostPayload(postForm)
    if (!payload.title || !payload.content) {
      setMessage('제목과 내용을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('게시글을 등록하는 중입니다.')

    try {
      const createdPost = await createPost(payload, accessToken)
      await loadPosts(1, { keyword: activeKeyword, tag: activeTag })
      await loadTags()
      setSelectedPost(createdPost)
      setComments([])
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
      setMessage('게시글 수정은 로그인이 필요합니다.')
      return
    }

    const payload = buildPostPayload(postForm)
    if (!payload.title || !payload.content) {
      setMessage('제목과 내용을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('게시글을 수정하는 중입니다.')

    try {
      const updatedPost = await updatePost(selectedPost.id, payload, accessToken)
      await loadPosts(page, { keyword: activeKeyword, tag: activeTag })
      setSelectedPost(updatedPost)
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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextKeyword = keywordInput.trim()
    setActiveKeyword(nextKeyword)
    void loadPosts(1, { keyword: nextKeyword, tag: activeTag })
  }

  function selectTag(tagName: string) {
    const nextTag = activeTag === tagName ? '' : tagName
    setActiveTag(nextTag)
    void loadPosts(1, { keyword: activeKeyword, tag: nextTag })
  }

  function clearFilters() {
    setKeywordInput('')
    setActiveKeyword('')
    setActiveTag('')
    void loadPosts(1, { keyword: '', tag: '' })
  }

  function renderAuthPanel() {
    if (currentUser) {
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md bg-white px-3 py-2 text-slate-700 shadow-sm">
            {currentUser.nickname}님 로그인 중
          </span>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode('profile'); setMessage('') }} type="button">
            마이페이지
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50" onClick={handleLogout} type="button">
            로그아웃
          </button>
        </div>
      )
    }

    return (
      <form className="grid gap-2 rounded-lg bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]" onSubmit={handleAuthSubmit}>
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500" onChange={(event) => updateAuthForm('email', event.target.value)} placeholder="이메일" type="email" value={authForm.email} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500" onChange={(event) => updateAuthForm('password', event.target.value)} placeholder="비밀번호" type="password" value={authForm.password} />
        {authMode === 'signup' && (
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 md:col-span-2" onChange={(event) => updateAuthForm('nickname', event.target.value)} placeholder="닉네임" type="text" value={authForm.nickname} />
        )}
        <div className="flex gap-2 md:col-start-3 md:row-span-2 md:row-start-1">
          <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300" disabled={isLoading} type="submit">
            {authMode === 'login' ? '로그인' : '가입'}
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setMessage('') }} type="button">
            {authMode === 'login' ? '회원가입' : '로그인으로'}
          </button>
        </div>
      </form>
    )
  }

  function renderPostForm() {
    const isCreateMode = viewMode === 'create'
    return (
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">{isCreateMode ? '새 게시글' : '게시글 수정'}</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{isCreateMode ? '동네 가게 질문을 작성합니다' : '게시글 내용을 수정합니다'}</h2>
          </div>
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode(selectedPost ? 'detail' : 'list'); setMessage('') }} type="button">
            취소
          </button>
        </div>

        <form className="space-y-4" onSubmit={isCreateMode ? handleCreatePost : handleUpdatePost}>
          <label className="block"><span className="text-sm font-medium text-slate-700">제목</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updatePostForm('title', event.target.value)} placeholder="예: 정글 근처 조용한 카페 추천해주세요" type="text" value={postForm.title} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">내용</span><textarea className="mt-1 min-h-40 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updatePostForm('content', event.target.value)} placeholder="궁금한 점이나 경험을 자세히 적어주세요." value={postForm.content} /></label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block"><span className="text-sm font-medium text-slate-700">동네</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updatePostForm('region', event.target.value)} placeholder="예: 역삼동" type="text" value={postForm.region} /></label>
            <label className="block"><span className="text-sm font-medium text-slate-700">가게명</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updatePostForm('store_name', event.target.value)} placeholder="예: 정글카페" type="text" value={postForm.store_name} /></label>
            <label className="block"><span className="text-sm font-medium text-slate-700">분류</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updatePostForm('category', event.target.value)} placeholder="예: 맛집" type="text" value={postForm.category} /></label>
          </div>

          <label className="block"><span className="text-sm font-medium text-slate-700">태그</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updatePostForm('tag_names', event.target.value)} placeholder="예: 조용한카페, 공부, 점심" type="text" value={postForm.tag_names} />{!isCreateMode && <p className="mt-1 text-xs text-slate-500">현재 백엔드는 게시글 수정 시 태그 변경을 저장하지 않습니다.</p>}</label>

          <button className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={isLoading} type="submit">
            {isCreateMode ? '등록' : '수정 완료'}
          </button>
        </form>
      </section>
    )
  }

  function renderComments() {
    return (
      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-950">댓글</h3>
          <span className="text-sm text-slate-500">{comments.length}개</span>
        </div>

        <div className="mt-4 space-y-3">
          {comments.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">아직 댓글이 없습니다.</p>}
          {comments.map((comment) => (
            <article className={`rounded-md bg-slate-50 p-4 ${comment.parent_id ? 'ml-6 border-l-4 border-emerald-200' : ''}`} key={comment.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong className="text-sm text-slate-900">{comment.author_nickname}</strong>
                  <span className="ml-2 text-xs text-slate-400">{formatDate(comment.created_at)}</span>
                  {comment.is_anonymous && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">익명</span>}
                </div>
                {comment.parent_id === null && <button className="text-xs font-medium text-emerald-700 hover:text-emerald-900" onClick={() => { setReplyTargetId(comment.id); setMessage('') }} type="button">답글</button>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</p>
            </article>
          ))}
        </div>

        <form className="mt-5 space-y-3" onSubmit={handleCreateComment}>
          {replyTargetId !== null && (
            <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>{replyTargetId}번 댓글에 답글 작성 중</span>
              <button className="font-medium" onClick={() => setReplyTargetId(null)} type="button">취소</button>
            </div>
          )}
          <textarea className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => setCommentContent(event.target.value)} placeholder="댓글을 입력하세요." value={commentContent} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input checked={isAnonymous} className="h-4 w-4" onChange={(event) => setIsAnonymous(event.target.checked)} type="checkbox" />익명으로 작성</label>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={isLoading || !hasAccessToken} type="submit">댓글 등록</button>
          </div>
          {!hasAccessToken && <p className="text-sm text-slate-500">댓글 작성은 로그인이 필요합니다. 상단에서 로그인해주세요.</p>}
        </form>
      </div>
    )
  }

  function renderProfile() {
    if (!currentUser) {
      return <section className="rounded-lg bg-white p-6 shadow-sm"><p className="text-sm text-slate-600">마이페이지는 로그인이 필요합니다.</p></section>
    }

    return (
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-emerald-700">마이페이지</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">내 정보 수정</h2>
          <p className="mt-2 text-sm text-slate-500">{currentUser.email}</p>
        </div>
        <form className="space-y-4" onSubmit={handleProfileSubmit}>
          <label className="block"><span className="text-sm font-medium text-slate-700">닉네임</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updateProfileForm('nickname', event.target.value)} type="text" value={profileForm.nickname} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">소개</span><textarea className="mt-1 min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => updateProfileForm('bio', event.target.value)} placeholder="간단한 소개를 입력하세요." value={profileForm.bio} /></label>
          <button className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={isLoading} type="submit">저장</button>
        </form>
      </section>
    )
  }

  return (
    <main className="pt-40 md:pt-32">
      <section className="mx-auto max-w-5xl">
        <header className="fixed top-0 left-0 z-50 w-full border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md">
          {/* 내부 여백과 최대 너비를 지정합니다 */}
          <div className="mx-auto max-w-7xl px-4 py-4 md:px-6">

            {/* md(PC) 환경에서는 양끝 정렬(between), 모바일에서는 세로 중앙 정렬(items-center) */}
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">

              {/* 1. 왼쪽 빈 공간 확보용 박스 (PC에서 제목을 정중앙에 두기 위한 트릭) */}
              <div className="hidden flex-1 md:block"></div>

              {/* 2. 제목 영역: text-center로 중앙 정렬 */}
              <div className="flex-1 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">여기저기</h1>
                <p className="mt-1.5 text-xs text-slate-500 md:text-sm">
                  전체 {totalCount}개 게시글, 총 {Math.max(totalPages, 1)}페이지
                </p>
              </div>

              {/* 3. 우측 버튼 영역: flex-1과 md:justify-end로 PC에서 우측 정렬을 강제하며 제목을 가리지 않습니다 */}
              <div className="flex flex-1 flex-wrap items-center justify-center gap-2 md:justify-end">
                {renderAuthPanel()}
                <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode('list'); setSelectedPost(null); setComments([]); setMessage(''); void loadPosts(page) }} type="button">목록</button>
                <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!hasAccessToken} onClick={openCreateForm} type="button">글쓰기</button>
              </div>

            </div>
          </div>
        </header>



        {message && <div className="mb-4 rounded-md bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div>}

        {viewMode === 'list' && (
          <section className="space-y-4">
            <form className="grid gap-2 rounded-lg bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]" onSubmit={handleSearchSubmit}>
              <input className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500" onChange={(event) => setKeywordInput(event.target.value)} placeholder="제목, 내용, 동네, 가게명으로 검색" type="search" value={keywordInput} />
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">검색</button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={clearFilters} type="button">초기화</button>
            </form>

            {tags.length > 0 && <div className="flex flex-wrap gap-2">{tags.map((tag) => <button className={`rounded-full px-3 py-1 text-xs font-medium ${activeTag === tag.name ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'}`} key={tag.id} onClick={() => selectTag(tag.name)} type="button">#{tag.name}</button>)}</div>}

            <div className="space-y-3">
              {posts.length === 0 && !isLoading && <p className="rounded-lg bg-white p-5 text-sm text-slate-500 shadow-sm">표시할 게시글이 없습니다.</p>}
              {posts.map((post) => (
                <article className="rounded-lg bg-white p-5 shadow-sm" key={post.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">{post.region && <span>{post.region}</span>}{post.category && <span>{post.category}</span>}{post.store_name && <span>{post.store_name}</span>}</div>
                  <button className="text-left text-lg font-semibold text-slate-950 hover:text-emerald-700" onClick={() => void openDetail(post.id)} type="button">{post.title}</button>
                  <p className="mt-3 text-xs text-slate-400">작성일 {formatDate(post.created_at)}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300" disabled={page <= 1 || isLoading} onClick={() => void loadPosts(page - 1)} type="button">이전</button>
              <span className="text-sm text-slate-600">{page} / {Math.max(totalPages, 1)}</span>
              <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300" disabled={page >= totalPages || isLoading} onClick={() => void loadPosts(page + 1)} type="button">다음</button>
            </div>
          </section>
        )}

        {viewMode === 'detail' && selectedPost && (
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">{selectedPost.region && <span>{selectedPost.region}</span>}{selectedPost.category && <span>{selectedPost.category}</span>}{selectedPost.store_name && <span>{selectedPost.store_name}</span>}</div>
                <h2 className="text-2xl font-bold text-slate-950">{selectedPost.title}</h2>
                <p className="mt-2 text-xs text-slate-400">작성일 {formatDate(selectedPost.created_at)} · 수정일 {formatDate(selectedPost.updated_at)}</p>
              </div>
              <div className="flex gap-2"><button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode('list'); setSelectedPost(null); setComments([]); setMessage('') }} type="button">목록</button><button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!hasAccessToken} onClick={openEditForm} type="button">수정</button></div>
            </div>
            <p className="whitespace-pre-wrap text-base leading-7 text-slate-800">{selectedPost.content}</p>
            {renderComments()}
          </section>
        )}

        {(viewMode === 'create' || viewMode === 'edit') && renderPostForm()}
        {viewMode === 'profile' && renderProfile()}
      </section>
    </main>
  )
}

export default App



