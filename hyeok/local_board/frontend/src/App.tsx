import { useState } from 'react'
import { login } from './api/authApi'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const token = await login({
        email,
        password,
      })

      setMessage(`로그인 성공: ${token.token_type}`)
      console.log(token.access_token)
    } catch (error) {
      if (error instanceof Error) {
        setMessage(error.message)
      } else {
        setMessage('로그인에 실패했습니다.')
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <section className="mx-auto max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-bold text-slate-900">로그인</h1>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              이메일
            </label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="hyeok@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              비밀번호
            </label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="12345678"
            />
          </div>

          <button className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
            로그인
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-slate-700">{message}</p>
        )}
      </section>
    </main>
  )
}

export default App