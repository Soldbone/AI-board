import type { FormEvent } from 'react'

type LoginFormState = {
  email: string
  password: string
}

type LoginPageProps = {
  form: LoginFormState
  isLoading: boolean
  onChange: (field: keyof LoginFormState, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onGoSignup: () => void
}

export function LoginPage({ form, isLoading, onChange, onSubmit, onGoSignup }: LoginPageProps) {
  return (
    <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 border-b border-slate-200 pb-5">
        <p className="text-sm font-semibold text-emerald-700">로그인</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">다시 만나서 반가워요</h2>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">이메일</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="email@example.com"
            type="email"
            value={form.email}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">비밀번호</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onChange('password', event.target.value)}
            placeholder="비밀번호"
            type="password"
            value={form.password}
          />
        </label>

        <button
          className="h-11 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isLoading}
          type="submit"
        >
          로그인
        </button>
      </form>

      <button
        className="mt-4 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        onClick={onGoSignup}
        type="button"
      >
        계정이 없으면 회원가입
      </button>
    </section>
  )
}
