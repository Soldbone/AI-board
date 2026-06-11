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
import { LoginPage } from './pages/LoginPage'
import { MyPage } from './pages/MyPage'
import { PostDetailPage } from './pages/PostDetailPage'
import { PostFormPage } from './pages/PostFormPage'
import { PostListPage } from './pages/PostListPage'
import { SignupPage } from './pages/SignupPage'
import { getAccessToken, removeAccessToken, saveAccessToken } from './utils/tokenStorage'

type ViewMode = 'list' | 'login' | 'signup' | 'detail' | 'create' | 'edit' | 'profile'

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
      setViewMode('list')
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
      setViewMode('list')
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
      setViewMode('login')
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
      tag_names: '',
    })
    setViewMode('edit')
    setMessage('')
  }

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      setViewMode('login')
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
      setViewMode('login')
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

  function goList() {
    setViewMode('list')
    setSelectedPost(null)
    setComments([])
    setMessage('')
  }

  function renderHeaderActions() {
    if (currentUser) {
      return (
        <>
          <span className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
            {currentUser.nickname}님
          </span>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode('profile'); setMessage('') }} type="button">
            마이페이지
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={handleLogout} type="button">
            로그아웃
          </button>
        </>
      )
    }

    return (
      <>
        <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode('login'); setMessage('') }} type="button">
          로그인
        </button>
        <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setViewMode('signup'); setMessage('') }} type="button">
          회원가입
        </button>
      </>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 pt-40 md:pt-32">
      <section className="mx-auto max-w-5xl">
        <header className="fixed top-0 left-0 z-50 w-full border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 py-4 md:px-6">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <div className="hidden flex-1 md:block" />

              <button className="flex-1 text-center" onClick={goList} type="button">
                <h1 className="text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">여기저기</h1>
                <p className="mt-1.5 text-xs text-slate-500 md:text-sm">
                  전체 {totalCount}개 게시글, 총 {Math.max(totalPages, 1)}페이지
                </p>
              </button>

              <div className="flex flex-1 flex-wrap items-center justify-center gap-2 md:justify-end">
                {renderHeaderActions()}
                <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { goList(); void loadPosts(page) }} type="button">
                  목록
                </button>
                <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!hasAccessToken} onClick={openCreateForm} type="button">
                  글쓰기
                </button>
              </div>
            </div>
          </div>
        </header>

        {message && <div className="mb-4 rounded-md bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div>}

        {viewMode === 'list' && (
          <PostListPage
            activeTag={activeTag}
            formatDate={formatDate}
            isLoading={isLoading}
            keywordInput={keywordInput}
            onClearFilters={clearFilters}
            onKeywordInputChange={setKeywordInput}
            onLoadPage={(nextPage) => void loadPosts(nextPage)}
            onOpenDetail={(postId) => void openDetail(postId)}
            onSearchSubmit={handleSearchSubmit}
            onSelectTag={selectTag}
            page={page}
            posts={posts}
            tags={tags}
            totalPages={totalPages}
          />
        )}

        {viewMode === 'login' && (
          <LoginPage
            form={{ email: authForm.email, password: authForm.password }}
            isLoading={isLoading}
            onChange={updateAuthForm}
            onGoSignup={() => { setViewMode('signup'); setMessage('') }}
            onSubmit={handleLoginSubmit}
          />
        )}

        {viewMode === 'signup' && (
          <SignupPage
            form={authForm}
            isLoading={isLoading}
            onChange={updateAuthForm}
            onGoLogin={() => { setViewMode('login'); setMessage('') }}
            onSubmit={handleSignupSubmit}
          />
        )}

        {viewMode === 'detail' && (
          <PostDetailPage
            commentContent={commentContent}
            comments={comments}
            formatDate={formatDate}
            hasAccessToken={hasAccessToken}
            isAnonymous={isAnonymous}
            isLoading={isLoading}
            onAnonymousChange={setIsAnonymous}
            onBack={goList}
            onCancelReply={() => setReplyTargetId(null)}
            onCommentContentChange={setCommentContent}
            onCreateComment={handleCreateComment}
            onEdit={openEditForm}
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
            onCancel={() => { setViewMode(selectedPost ? 'detail' : 'list'); setMessage('') }}
            onChange={updatePostForm}
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
