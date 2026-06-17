import type { FormEvent } from 'react'
import type { UserResponse } from '../api/authApi'

type ProfileFormState = {
  nickname: string
  bio: string
}

type MyPageProps = {
  currentUser: UserResponse | null
  profileForm: ProfileFormState
  isLoading: boolean
  onChange: (field: keyof ProfileFormState, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function MyPage({ currentUser, profileForm, isLoading, onChange, onSubmit }: MyPageProps) {
  if (!currentUser) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">마이페이지는 로그인이 필요합니다.</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <p className="text-sm font-semibold text-emerald-700">마이페이지</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">내 정보 수정</h2>
        <div className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {currentUser.email}
        </div>
      </div>

      <form className="space-y-5 p-6" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">닉네임</span>
          <input
            className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onChange('nickname', event.target.value)}
            type="text"
            value={profileForm.nickname}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">소개</span>
          <textarea
            className="mt-1 min-h-32 w-full resize-y rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onChange('bio', event.target.value)}
            placeholder="간단한 소개를 입력하세요."
            value={profileForm.bio}
          />
        </label>

        <button
          className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isLoading}
          type="submit"
        >
          저장
        </button>
      </form>
    </section>
  )
}
