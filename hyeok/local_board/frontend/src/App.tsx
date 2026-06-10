import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  createPost,
  getPost,
  getPosts,
  updatePost,
  type PostFormPayload,
  type PostListItem,
  type PostRead,
} from './api/postApi'
import { getAccessToken } from './utils/tokenStorage'

type ViewMode = 'list' | 'detail' | 'create' | 'edit'

type PostFormState = {
  title: string
  content: string
  region: string
  store_name: string
  category: string
  tag_names: string
}

const emptyPostForm: PostFormState = {
  title: '',
  content: '',
  region: '',
  store_name: '',
  category: '',
  tag_names: '',
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '요청을 처리하지 못했습니다.'
}

function toNullable(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseTagNames(value: string) {
  return value
    .split(',')
    .map((tagName) => tagName.trim())
    .filter(Boolean)
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
  const [posts, setPosts] = useState<PostListItem[]>([])
  const [selectedPost, setSelectedPost] = useState<PostRead | null>(null)
  const [form, setForm] = useState<PostFormState>(emptyPostForm)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [message, setMessage] = useState('게시글 목록을 불러오는 중입니다.')
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken] = useState(() => getAccessToken())

  const hasAccessToken = Boolean(accessToken)

  const loadPosts = useCallback(async (nextPage = 1) => {
    setIsLoading(true)
    setMessage('게시글 목록을 불러오는 중입니다.')

    try {
      const data = await getPosts({ page: nextPage, size: 10 })

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
  }, [])

  useEffect(() => {
    let shouldUpdate = true

    getPosts({ page: 1, size: 10 })
      .then((data) => {
        if (!shouldUpdate) {
          return
        }

        setPosts(data.items)
        setPage(data.page)
        setTotalCount(data.total_count)
        setTotalPages(data.total_pages)
        setMessage('')
      })
      .catch((error) => {
        if (shouldUpdate) {
          setMessage(getErrorMessage(error))
        }
      })
      .finally(() => {
        if (shouldUpdate) {
          setIsLoading(false)
        }
      })

    return () => {
      shouldUpdate = false
    }
  }, [])

  async function openDetail(postId: number) {
    setViewMode('detail')
    setSelectedPost(null)
    setIsLoading(true)
    setMessage('게시글 상세 내용을 불러오는 중입니다.')

    try {
      const data = await getPost(postId)
      setSelectedPost(data)
      setMessage('')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateForm() {
    setForm(emptyPostForm)
    setSelectedPost(null)
    setViewMode('create')
    setMessage('')
  }

  function openEditForm() {
    if (!selectedPost) {
      return
    }

    setForm({
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

  function updateForm(field: keyof PostFormState, value: string) {
    setForm((prevForm) => ({
      ...prevForm,
      [field]: value,
    }))
  }

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!accessToken) {
      setMessage('글쓰기는 로그인이 필요합니다.')
      return
    }

    const payload = buildPostPayload(form)

    if (!payload.title || !payload.content) {
      setMessage('제목과 내용을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('게시글을 등록하는 중입니다.')

    try {
      const createdPost = await createPost(payload, accessToken)
      await loadPosts(1)
      setSelectedPost(createdPost)
      setViewMode('detail')
      setMessage('게시글이 등록되었습니다.')
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

    const payload = buildPostPayload(form)

    if (!payload.title || !payload.content) {
      setMessage('제목과 내용을 입력해주세요.')
      return
    }

    setIsLoading(true)
    setMessage('게시글을 수정하는 중입니다.')

    try {
      const updatedPost = await updatePost(selectedPost.id, payload, accessToken)
      await loadPosts(page)
      setSelectedPost(updatedPost)
      setViewMode('detail')
      setMessage('게시글이 수정되었습니다.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  function renderPostForm() {
    const isCreateMode = viewMode === 'create'

    return (
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              {isCreateMode ? '새 게시글' : '게시글 수정'}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {isCreateMode ? '동네 후기를 작성합니다' : '게시글 내용을 수정합니다'}
            </h2>
          </div>

          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              if (selectedPost) {
                setViewMode('detail')
              } else {
                setViewMode('list')
              }
              setMessage('')
            }}
            type="button"
          >
            취소
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={isCreateMode ? handleCreatePost : handleUpdatePost}
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-700">제목</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
              onChange={(event) => updateForm('title', event.target.value)}
              placeholder="예: 둔전역 진샤이 어때요?"
              type="text"
              value={form.title}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">내용</span>
            <textarea
              className="mt-1 min-h-40 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
              onChange={(event) => updateForm('content', event.target.value)}
              placeholder="궁금한 점이나 후기를 적어주세요."
              value={form.content}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">동네</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                onChange={(event) => updateForm('region', event.target.value)}
                placeholder="둔전역"
                type="text"
                value={form.region}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">가게</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                onChange={(event) => updateForm('store_name', event.target.value)}
                placeholder="진샤이"
                type="text"
                value={form.store_name}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">분류</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                onChange={(event) => updateForm('category', event.target.value)}
                placeholder="맛집"
                type="text"
                value={form.category}
              />
            </label>
          </div>

          {isCreateMode && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">태그</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                onChange={(event) => updateForm('tag_names', event.target.value)}
                placeholder="중국집, 진샤이, 맛집"
                type="text"
                value={form.tag_names}
              />
            </label>
          )}

          <button
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isLoading}
            type="submit"
          >
            {isCreateMode ? '등록' : '수정 완료'}
          </button>
        </form>
      </section>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8">
      <section className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Local Board</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">
              동네 후기 게시판
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              전체 {totalCount}개 게시글, 총 {totalPages}페이지
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {hasAccessToken ? '로그인됨' : '로그인 필요'}
            </span>
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setViewMode('list')
                setSelectedPost(null)
                void loadPosts(page)
              }}
              type="button"
            >
              목록
            </button>
            <button
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!hasAccessToken}
              onClick={openCreateForm}
              type="button"
            >
              글쓰기
            </button>
          </div>
        </header>

        {message && (
          <div className="mb-4 rounded-md bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        {viewMode === 'list' && (
          <section>
            <div className="space-y-3">
              {posts.map((post) => (
                <article className="rounded-lg bg-white p-5 shadow-sm" key={post.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {post.region && <span>{post.region}</span>}
                    {post.category && <span>{post.category}</span>}
                    {post.store_name && <span>{post.store_name}</span>}
                  </div>

                  <button
                    className="text-left text-lg font-semibold text-slate-950 hover:text-emerald-700"
                    onClick={() => void openDetail(post.id)}
                    type="button"
                  >
                    {post.title}
                  </button>

                  <p className="mt-3 text-xs text-slate-400">
                    작성일 {formatDate(post.created_at)}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                disabled={page <= 1 || isLoading}
                onClick={() => void loadPosts(page - 1)}
                type="button"
              >
                이전
              </button>

              <span className="text-sm text-slate-600">
                {page} / {Math.max(totalPages, 1)}
              </span>

              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                disabled={page >= totalPages || isLoading}
                onClick={() => void loadPosts(page + 1)}
                type="button"
              >
                다음
              </button>
            </div>
          </section>
        )}

        {viewMode === 'detail' && selectedPost && (
          <section className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {selectedPost.region && <span>{selectedPost.region}</span>}
                  {selectedPost.category && <span>{selectedPost.category}</span>}
                  {selectedPost.store_name && <span>{selectedPost.store_name}</span>}
                </div>
                <h2 className="text-2xl font-bold text-slate-950">
                  {selectedPost.title}
                </h2>
                <p className="mt-2 text-xs text-slate-400">
                  작성일 {formatDate(selectedPost.created_at)} · 수정일{' '}
                  {formatDate(selectedPost.updated_at)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setViewMode('list')
                    setSelectedPost(null)
                    setMessage('')
                  }}
                  type="button"
                >
                  목록
                </button>
                <button
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!hasAccessToken}
                  onClick={openEditForm}
                  type="button"
                >
                  수정
                </button>
              </div>
            </div>

            <p className="whitespace-pre-wrap text-base leading-7 text-slate-800">
              {selectedPost.content}
            </p>
          </section>
        )}

        {(viewMode === 'create' || viewMode === 'edit') && renderPostForm()}
      </section>
    </main>
  )
}

export default App
