import { useEffect, useState } from 'react'
import { apiGet } from './api/client'

type HealthResponse = {
  status: string
}

function App() {
  const [message, setMessage] = useState('API 확인 중...')

  useEffect(() => {
    apiGet<HealthResponse>('/health')
      .then((data) => {
        setMessage(`백엔드 연결 성공: ${data.status}`)
      })
      .catch((error) => {
        setMessage(`백엔드 연결 실패: ${error.message}`)
      })
  }, [])

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <section className="mx-auto max-w-xl rounded-lg bg-white p-6 shadow">
        <h1 className="text-3xl font-bold text-blue-600">
          API Client 테스트
        </h1>
        <p className="mt-3 text-gray-600">{message}</p>
      </section>
    </main>
  )
}

export default App