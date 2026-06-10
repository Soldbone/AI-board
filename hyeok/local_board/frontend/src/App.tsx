function App() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <section className="mx-auto max-w-xl rounded-lg bg-white p-6 shadow">
        <h1 className="text-3xl font-bold text-blue-600">
          Tailwind 연결 확인
        </h1>
        <p className="mt-3 text-gray-600">
          이 화면이 회색 배경, 흰색 박스, 파란 제목으로 보이면 Tailwind가 적용된 것입니다.
        </p>
        <button className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          확인
        </button>
      </section>
    </main>
  )
}

export default App