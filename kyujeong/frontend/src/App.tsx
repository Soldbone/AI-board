import { useState } from 'react'
import './App.css'

function App() {
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupNickname, setSignupNickname] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [accessToken, setAccessToken] = useState('')
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
          <button type="button">내 정보 조회</button>
        </section>

        <form className="panel">
          <h2>게시글 작성</h2>
          <label>
            제목
            <input type="text" placeholder="첫 게시글" />
          </label>
          <label>
            내용
            <textarea placeholder="게시글 생성 테스트입니다." rows={5} />
          </label>
          <button type="button">게시글 생성</button>
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
