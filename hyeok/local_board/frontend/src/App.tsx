import { useEffect, useState } from 'react'
import { getPosts, type PostListItem } from './api/postApi'

function App() {
  const [posts, setPosts] = useState<PostListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [message, setMessage] = useState('게시글 목록을 불러오는 중입니다.')

  useEffect(() => {
    getPosts()
      .then((data) => {
        setPosts(data.items)
        setTotalCount(data.total_count)
        setTotalPages(data.total_pages)
        setMessage('')
      })
      .catch((error) => {
        if (error instanceof Error) {
          setMessage(error.message)
        } else {
          setMessage('게시글 목록을 불러오지 못했습니다.')
        }
      })
  }, [])

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <section className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">동네 게시판</h1>
          <p className="mt-2 text-sm text-slate-600">
            전체 {totalCount}개 게시글, 총 {totalPages}페이지
          </p>
        </header>

        {message && (
          <div className="rounded-md bg-white p-4 text-sm text-slate-700 shadow">
            {message}
          </div>
        )}

        <div className="space-y-3">
          {posts.map((post) => (
            <article
              className="rounded-lg bg-white p-5 shadow"
              key={post.id}
            >
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                {post.region && <span>{post.region}</span>}
                {post.category && <span>{post.category}</span>}
                {post.store_name && <span>{post.store_name}</span>}
              </div>

              <h2 className="text-lg font-semibold text-slate-900">
                {post.title}
              </h2>

              <p className="mt-3 text-xs text-slate-400">
                작성일: {new Date(post.created_at).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App