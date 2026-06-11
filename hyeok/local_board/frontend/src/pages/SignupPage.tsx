import type { FormEvent } from 'react'

type SignupFormState = {
  email: string
  password: string
  nickname: string
}

type SignupPageProps = {
  form: SignupFormState
  isLoading: boolean
  onChange: (field: keyof SignupFormState, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onGoLogin: () => void
}

export function SignupPage({ form, isLoading, onChange, onSubmit, onGoLogin }: SignupPageProps) {
  return (
    <section className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-emerald-700">회원가입</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">새 계정 만들기</h2>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">이메일</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="email@example.com"
            type="email"
            value={form.email}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">닉네임</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
            onChange={(event) => onChange('nickname', event.target.value)}
            placeholder="닉네임"
            type="text"
            value={form.nickname}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">비밀번호</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
            onChange={(event) => onChange('password', event.target.value)}
            placeholder="비밀번호"
            type="password"
            value={form.password}
          />
        </label>

        <button
          className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isLoading}
          type="submit"
        >
          회원가입
        </button>
      </form>

      <button className="mt-4 text-sm font-medium text-emerald-700 hover:text-emerald-900" onClick={onGoLogin} type="button">
        이미 계정이 있으면 로그인
      </button>
    </section>
  )
}
