import { useState } from 'react'
import './App.css'

type PostListItem = {
  id: number
  title: string
  createdAt: string
  author: {
    nickname: string
  }
}

type PostDetail = {
  id: number
  title: string
  content: string
  viewCount: number
  createdAt: string
  updatedAt: string
  author: {
    nickname: string
  }
}

function App() {
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupNickname, setSignupNickname] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [postContent, setPostContent] = useState('')
  const [postSearch, setPostSearch] = useState('')
  const [postPage, setPostPage] = useState('1')
  const [postSize, setPostSize] = useState('10')
  const [posts, setPosts] = useState<PostListItem[]>([])
  const [detailPostId, setDetailPostId] = useState('')
  const [postDetail, setPostDetail] = useState<PostDetail | null>(null)
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateContent, setUpdateContent] = useState('')
  const [result, setResult] = useState(
    '아직 API 연결 전입니다.\n다음 단계에서 버튼을 누르면 백엔드 응답이 여기에 표시됩니다.',
  )

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

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

    const data = await response.json()
    setResult(JSON.stringify(data, null, 2))
  }

  async function loadPosts(page = postPage) {
    const params = new URLSearchParams({
      page: page || '1',
      size: postSize || '10',
    })

    const keyword = postSearch.trim()

    if (keyword) {
      params.set('search', keyword)
    }

    const response = await fetch(`/api/posts?${params.toString()}`)
    const data = await response.json()

    if (response.ok && Array.isArray(data)) {
      setPosts(data)
    }

    setResult(JSON.stringify(data, null, 2))
  }

  function handleLoadPosts(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadPosts()
  }

  function handleMovePage(nextPage: number) {
    const safePage = Math.max(nextPage, 1)

    setPostPage(String(safePage))
    loadPosts(String(safePage))
  }

  async function loadPostDetail(id = detailPostId) {
    if (!id) {
      setResult('상세 조회할 게시글 id를 입력하거나 목록에서 게시글을 선택하세요.')
      return
    }

    const response = await fetch(`/api/posts/${id}`)
    const data = await response.json()

    if (response.ok) {
      setPostDetail(data)
      setDetailPostId(String(data.id))
      setUpdateTitle(data.title)
      setUpdateContent(data.content)
    }

    setResult(JSON.stringify(data, null, 2))
  }

  function handleLoadPostDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadPostDetail()
  }

  async function handleCreatePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: postTitle,
        content: postContent,
      }),
    })

    const data = await response.json()
    setResult(JSON.stringify(data, null, 2))
  }

  async function handleUpdatePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!detailPostId) {
      setResult('수정할 게시글 id를 먼저 입력하거나 상세 조회하세요.')
      return
    }

    const response = await fetch(`/api/posts/${detailPostId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: updateTitle,
        content: updateContent,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      setPostDetail(data)
      setUpdateTitle(data.title)
      setUpdateContent(data.content)
    }

    setResult(JSON.stringify(data, null, 2))
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

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

    const data = await response.json()

    if (response.ok) {
      setAccessToken(data.accessToken)
    }

    setResult(JSON.stringify(data, null, 2))
  }

  async function handleFindMe() {
    const response = await fetch('/api/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data = await response.json()
    setResult(JSON.stringify(data, null, 2))
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">AI Board Frontend</p>
        <h1>게시판 백엔드 확인용 화면</h1>
        <p className="description">
          회원가입, 로그인, 내 정보 조회, 게시글 생성을 화면에서 확인하기 위한
          기본 틀입니다.
        </p>
      </header>

      <section className="workspace" aria-label="게시판 기능 확인 영역">
        <form className="panel" onSubmit={handleSignup}>
          <h2>회원가입</h2>
          <label>
            이메일
            <input
              type="email"
              placeholder="posttest@example.com"
              value={signupEmail}
              onChange={(event) => setSignupEmail(event.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              placeholder="password1234"
              value={signupPassword}
              onChange={(event) => setSignupPassword(event.target.value)}
            />
          </label>
          <label>
            닉네임
            <input
              type="text"
              placeholder="posttest"
              value={signupNickname}
              onChange={(event) => setSignupNickname(event.target.value)}
            />
          </label>
          <button type="submit">회원가입</button>
        </form>

        <form className="panel" onSubmit={handleLogin}>
          <h2>로그인</h2>
          <label>
            이메일
            <input
              type="email"
              placeholder="posttest@example.com"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              placeholder="password1234"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
          </label>
          <button type="submit">로그인</button>
          <p className="muted">
            토큰 상태: {accessToken ? '저장됨' : '아직 없음'}
          </p>
        </form>

        <section className="panel">
          <h2>내 정보</h2>
          <p className="muted">로그인 후 현재 사용자 정보를 확인할 영역입니다.</p>
          <button type="button" onClick={handleFindMe}>
            내 정보 조회
          </button>
        </section>

        <form className="panel" onSubmit={handleCreatePost}>
          <h2>게시글 작성</h2>
          <label>
            제목
            <input
              type="text"
              placeholder="첫 게시글"
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
            />
          </label>
          <label>
            내용
            <textarea
              placeholder="게시글 생성 테스트입니다."
              rows={5}
              value={postContent}
              onChange={(event) => setPostContent(event.target.value)}
            />
          </label>
          <button type="submit">게시글 생성</button>
        </form>

        <form className="panel post-list-panel" onSubmit={handleLoadPosts}>
          <h2>게시글 목록</h2>
          <label>
            제목 검색
            <input
              type="search"
              placeholder="검색어"
              value={postSearch}
              onChange={(event) => setPostSearch(event.target.value)}
            />
          </label>
          <div className="inline-fields">
            <label>
              페이지
              <input
                type="number"
                min="1"
                value={postPage}
                onChange={(event) => setPostPage(event.target.value)}
              />
            </label>
            <label>
              개수
              <input
                type="number"
                min="1"
                value={postSize}
                onChange={(event) => setPostSize(event.target.value)}
              />
            </label>
          </div>
          <div className="button-row">
            <button type="submit">목록 조회</button>
            <button
              type="button"
              onClick={() => handleMovePage(Number(postPage) - 1)}
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => handleMovePage(Number(postPage) + 1)}
            >
              다음
            </button>
          </div>

          {posts.length > 0 ? (
            <ul className="post-list">
              {posts.map((post) => (
                <li key={post.id}>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => loadPostDetail(String(post.id))}
                  >
                    {post.title}
                  </button>
                  <span>{post.author.nickname}</span>
                  <time dateTime={post.createdAt}>
                    {new Date(post.createdAt).toLocaleString('ko-KR')}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">아직 조회된 게시글이 없습니다.</p>
          )}
        </form>

        <form className="panel detail-panel" onSubmit={handleLoadPostDetail}>
          <h2>게시글 상세</h2>
          <label>
            게시글 id
            <input
              type="number"
              min="1"
              placeholder="1"
              value={detailPostId}
              onChange={(event) => setDetailPostId(event.target.value)}
            />
          </label>
          <button type="submit">상세 조회</button>

          {postDetail ? (
            <article className="post-detail">
              <div>
                <h3>{postDetail.title}</h3>
                <p className="muted">
                  {postDetail.author.nickname} · 조회수 {postDetail.viewCount}
                </p>
              </div>
              <p>{postDetail.content}</p>
              <p className="muted">
                작성: {new Date(postDetail.createdAt).toLocaleString('ko-KR')}
              </p>
              <p className="muted">
                수정: {new Date(postDetail.updatedAt).toLocaleString('ko-KR')}
              </p>
            </article>
          ) : (
            <p className="muted">아직 조회된 상세 게시글이 없습니다.</p>
          )}
        </form>

        <form className="panel update-panel" onSubmit={handleUpdatePost}>
          <h2>게시글 수정</h2>
          <p className="muted">
            상세 조회한 게시글을 현재 로그인한 사용자 토큰으로 수정합니다.
          </p>
          <label>
            제목
            <input
              type="text"
              placeholder="수정할 제목"
              value={updateTitle}
              onChange={(event) => setUpdateTitle(event.target.value)}
            />
          </label>
          <label>
            내용
            <textarea
              placeholder="수정할 내용"
              rows={5}
              value={updateContent}
              onChange={(event) => setUpdateContent(event.target.value)}
            />
          </label>
          <button type="submit">게시글 수정</button>
        </form>
      </section>

      <section className="result-panel" aria-label="API 응답 확인 영역">
        <h2>응답 확인</h2>
        <pre>{result}</pre>
      </section>
    </main>
  )
}

export default App
