import type { FormEvent } from 'react'

type PostFormState = {
  title: string
  content: string
  region: string
  store_name: string
  category: string
  tag_names: string
}

type PostFormPageProps = {
  mode: 'create' | 'edit'
  form: PostFormState
  isLoading: boolean
  onChange: (field: keyof PostFormState, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export function PostFormPage({ mode, form, isLoading, onChange, onSubmit, onCancel }: PostFormPageProps) {
  const isCreateMode = mode === 'create'

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">{isCreateMode ? '새 게시글' : '게시글 수정'}</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            {isCreateMode ? '동네 가게 질문을 작성합니다' : '게시글 내용을 수정합니다'}
          </h2>
        </div>
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={onCancel} type="button">
          취소
        </button>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">제목</span>
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onChange('title', event.target.value)} placeholder="예: 정글 근처 조용한 카페 추천해주세요" type="text" value={form.title} />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">내용</span>
          <textarea className="mt-1 min-h-40 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onChange('content', event.target.value)} placeholder="궁금한 점이나 경험을 자세히 적어주세요." value={form.content} />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">동네</span>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onChange('region', event.target.value)} placeholder="예: 역삼동" type="text" value={form.region} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">가게명</span>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onChange('store_name', event.target.value)} placeholder="예: 정글카페" type="text" value={form.store_name} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">분류</span>
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onChange('category', event.target.value)} placeholder="예: 맛집" type="text" value={form.category} />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">태그</span>
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onChange('tag_names', event.target.value)} placeholder="예: 조용한카페, 공부, 점심" type="text" value={form.tag_names} />
          {!isCreateMode && <p className="mt-1 text-xs text-slate-500">현재 백엔드는 게시글 수정 시 태그 변경을 저장하지 않습니다.</p>}
        </label>

        <button className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={isLoading} type="submit">
          {isCreateMode ? '등록' : '수정 완료'}
        </button>
      </form>
    </section>
  )
}
