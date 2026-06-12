import { useEffect, useMemo, useState } from 'react'
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
  aiStatus: '완료' | '대기중' | '분석중'
  createdAt: string
}

const categories = ['전체', '계란', '김치', '간단요리', '자취요리', '국물요리', '10분요리']

const pageSize = 10

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

async function fetchMyPostItems(accessToken: string) {
  const response = await fetch('/api/users/me/posts', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = (await response.json()) as PostListItem[] & { message?: string }

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
  const data = (await response.json()) as MyCommentItem[] & {
    message?: string
  }

  if (!response.ok) {
    throw new Error(data.message ?? '내가 작성한 댓글을 불러오지 못했습니다.')
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

function mapPostListItem(post: PostListItem): BoardPost {
  return {
    id: post.id,
    title: post.title,
    tags: post.tags ?? [],
    authorId: post.author.id,
    author: post.author.nickname,
    comments: post.commentsCount ?? 0,
    aiStatus: '대기중',
    createdAt: formatDate(post.createdAt),
  }
}

function App() {
  const [currentView, setCurrentView] = useState<
    | 'board'
    | 'login'
    | 'signup'
    | 'forgotPassword'
    | 'write'
    | 'mypage'
    | 'tags'
    | 'aiGuide'
    | 'notifications'
  >('board')
  const [accessToken, setAccessToken] = useState(getSavedAccessToken)
  const [currentUser, setCurrentUser] = useState<LoginUser | null>(getSavedUser)
  const [activeCategory, setActiveCategory] = useState('전체')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
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
  const [editingPostId, setEditingPostId] = useState<number | null>(null)
  const [postCreateErrorMessage, setPostCreateErrorMessage] = useState('')
  const [isPostCreating, setIsPostCreating] = useState(false)
  const [me, setMe] = useState<LoginUser | null>(currentUser)
  const [isMeLoading, setIsMeLoading] = useState(false)
  const [meErrorMessage, setMeErrorMessage] = useState('')
  const [myPageSection, setMyPageSection] = useState<
    'info' | 'posts' | 'comments' | 'likes' | 'settings'
  >('info')
  const [myPosts, setMyPosts] = useState<BoardPost[]>([])
  const [isMyPostsLoading, setIsMyPostsLoading] = useState(false)
  const [myPostsErrorMessage, setMyPostsErrorMessage] = useState('')
  const [myComments, setMyComments] = useState<MyCommentItem[]>([])
  const [isMyCommentsLoading, setIsMyCommentsLoading] = useState(false)
  const [myCommentsErrorMessage, setMyCommentsErrorMessage] = useState('')

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
  const isAuthView =
    currentView === 'login' ||
    currentView === 'signup' ||
    currentView === 'forgotPassword'

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
        const data = (await response.json()) as PostListResponse & {
          message?: string
        }

        if (!response.ok) {
          throw new Error(data.message ?? '게시글 목록을 불러오지 못했습니다.')
        }

        setPosts(data.items.map(mapPostListItem))
        setTotalPages(Math.max(data.totalPages, 1))
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setPosts([])
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

  function handleSearchKeywordChange(value: string) {
    setSearchKeyword(value)
    setPage(1)
  }

  function handleCategoryChange(category: string) {
    setActiveCategory(category)
    setPage(1)
  }

  async function loadPostDetail(postId: number) {
    setIsDetailLoading(true)
    setDetailErrorMessage('')
    setCommentErrorMessage('')
    setCommentSubmitMessage('')
    setCommentContent('')
    setEditingCommentId(null)
    setEditingCommentContent('')
    setPostDeleteErrorMessage('')
    setComments([])

    try {
      const [postResponse, commentsResponse] = await Promise.all([
        fetch(`/api/posts/${postId}`),
        fetch(`/api/posts/${postId}/comments`),
      ])
      const postData = await postResponse.json()
      const commentsData = await commentsResponse.json()

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

  function goBackToList() {
    setSelectedPost(null)
    setComments([])
    setDetailErrorMessage('')
    setCommentErrorMessage('')
    setCommentSubmitMessage('')
    setCommentContent('')
    setEditingCommentId(null)
    setEditingCommentContent('')
    setPostDeleteErrorMessage('')
  }

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
      const data = await response.json()

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
      const data = await response.json()

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
      const data = await response.json()

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
      const data = (await response.json()) as LoginResponse & { message?: string }

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
      const data = (await response.json()) as { message?: string }

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

    try {
      const response = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = (await response.json()) as LoginUser & { message?: string }

      if (!response.ok) {
        throw new Error(data.message ?? '내 정보를 불러오지 못했습니다.')
      }

      updateSavedUser(data)
      setCurrentUser(data)
      setMe(data)

      const [postsResult, commentsResult] = await Promise.allSettled([
        fetchMyPostItems(accessToken),
        fetchMyCommentItems(accessToken),
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
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message ?? '게시글을 삭제하지 못했습니다.')
      }

      setSelectedPost(null)
      setComments([])
      setPage(1)
      setPostListReloadKey((currentKey) => currentKey + 1)
      setCurrentView('board')
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
    setPostCreateErrorMessage('')
    setCurrentView('write')
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
    setPostCreateErrorMessage('')
    setPostDeleteErrorMessage('')
    setCurrentView('write')
  }

  function closeWriteView() {
    setPostCreateErrorMessage('')
    setCurrentView('board')
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
      const data = await response.json()

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

          <label className="top-search">
            <span className="sr-only">게시글 검색</span>
            <input
              type="search"
              placeholder="게시글 제목으로 검색하세요"
              value={searchKeyword}
              onChange={(event) => handleSearchKeywordChange(event.target.value)}
            />
          </label>

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
                내 정보
              </button>
              <button
                className={myPageSection === 'posts' ? 'active' : ''}
                type="button"
                onClick={loadMyPosts}
              >
                내가 작성한 글
              </button>
              <button
                className={myPageSection === 'comments' ? 'active' : ''}
                type="button"
                onClick={loadMyComments}
              >
                내가 작성한 댓글
              </button>
              <button
                className={myPageSection === 'likes' ? 'active' : ''}
                type="button"
                onClick={() => setMyPageSection('likes')}
              >
                좋아요한 글
              </button>
              <button
                className={myPageSection === 'settings' ? 'active' : ''}
                type="button"
                onClick={() => setMyPageSection('settings')}
              >
                설정
              </button>
            </aside>

            <section className="mypage-card">
              <button
                className="back-button"
                type="button"
                onClick={() => setCurrentView('board')}
              >
                게시판으로
              </button>

              {myPageSection === 'info' && isMeLoading ? (
                <div className="mypage-state">내 정보를 불러오는 중입니다.</div>
              ) : myPageSection === 'info' && meErrorMessage ? (
                <div className="mypage-state error">{meErrorMessage}</div>
              ) : myPageSection === 'info' && me ? (
                <>
                  <div className="mypage-profile">
                    <div className="mypage-avatar" aria-hidden="true">
                      {me.nickname.slice(0, 1)}
                    </div>
                    <div>
                      <h1>{me.nickname}</h1>
                      <p>{me.email}</p>
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

                  <div className="mypage-stats" aria-label="활동 통계">
                    <div>
                      <span>작성한 글</span>
                      <strong>{myPosts.length || '-'}</strong>
                    </div>
                    <div>
                      <span>작성한 댓글</span>
                      <strong>{myComments.length || '-'}</strong>
                    </div>
                    <div>
                      <span>AI 추천 받은 횟수</span>
                      <strong>-</strong>
                    </div>
                  </div>
                </>
              ) : myPageSection === 'posts' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>내가 작성한 글</h1>
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
                    <h1>내가 작성한 댓글</h1>
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
              ) : myPageSection === 'likes' ? (
                <div className="mypage-posts">
                  <div className="mypage-section-heading">
                    <h1>좋아요한 글</h1>
                    <p>좋아요 기능을 붙이면 이곳에서 모아볼 수 있습니다.</p>
                  </div>

                  <div className="coming-soon-panel">
                    <strong>아직 연결 전입니다.</strong>
                    <p>
                      좋아요 API가 준비되면 내가 저장한 게시글 목록으로 바뀝니다.
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

            <div className="utility-heading">
              <h1>태그</h1>
              <p>관심 있는 태그를 선택하면 해당 태그의 게시글을 볼 수 있습니다.</p>
            </div>

            <div className="tag-explorer">
              {popularTagItems.length > 0
                ? popularTagItems.map(([tag, count]) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => {
                        handleCategoryChange(tag)
                        setCurrentView('board')
                      }}
                    >
                      <span>{tag}</span>
                      <strong>{count}</strong>
                    </button>
                  ))
                : categories
                    .filter((category) => category !== '전체')
                    .map((category) => (
                      <button
                        type="button"
                        key={category}
                        onClick={() => {
                          handleCategoryChange(category)
                          setCurrentView('board')
                        }}
                      >
                        <span>{category}</span>
                        <strong>0</strong>
                      </button>
                    ))}
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
              <p>추천 기능을 붙이기 전까지는 게시글 작성 흐름만 준비해둡니다.</p>
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

            <button className="write-button" type="button" onClick={openWriteView}>
              글쓰기
            </button>
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

              <div className="write-tip">
                재료, 식사 상황, 조리 시간 등을 구체적으로 적으면 나중에 AI 추천을 붙이기 좋아요.
              </div>

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
          </section>
        ) : selectedPost || isDetailLoading || detailErrorMessage ? (
          <section className="detail-view">
            <button className="back-button" type="button" onClick={goBackToList}>
              목록으로
            </button>

            {isDetailLoading ? (
              <div className="detail-card detail-state">게시글을 불러오는 중입니다.</div>
            ) : detailErrorMessage ? (
              <div className="detail-card detail-state error">{detailErrorMessage}</div>
            ) : selectedPost ? (
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
            ) : null}
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
              <label className="board-search">
                <span className="sr-only">목록 검색</span>
                <input
                  type="search"
                  placeholder="게시글 제목으로 검색"
                  value={searchKeyword}
                  onChange={(event) => handleSearchKeywordChange(event.target.value)}
                />
              </label>
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
                    className={`status-badge ${post.aiStatus === '완료' ? 'done' : post.aiStatus === '대기중' ? 'pending' : 'working'}`}
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
      </section>
    </main>
  )
}

export default App
