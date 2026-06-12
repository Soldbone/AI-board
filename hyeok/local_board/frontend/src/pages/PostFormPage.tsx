import { useState, type FormEvent } from 'react'
import {
  getAiTagSuggestions,
  getSimilarPosts,
  type AiTagSuggestionItem,
  type SimilarPostItem,
} from '../api/aiApi'

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

function parseTagNames(value: string) {
  return value
    .split(',')
    .map((tagName) => tagName.trim())
    .filter(Boolean)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR')
}

export function PostFormPage({
  mode,
  form,
  isLoading,
  onChange,
  onSubmit,
  onCancel,
}: PostFormPageProps) {
  const isCreateMode = mode === 'create'
  const [similarPosts, setSimilarPosts] = useState<SimilarPostItem[]>([])
  const [similarPostMessage, setSimilarPostMessage] = useState('')
  const [isSimilarPostLoading, setIsSimilarPostLoading] = useState(false)
  const [aiTagSuggestions, setAiTagSuggestions] = useState<AiTagSuggestionItem[]>([])
  const [aiTagMessage, setAiTagMessage] = useState('')
  const [isAiTagLoading, setIsAiTagLoading] = useState(false)

  const canSearchSimilarPosts = Boolean(
    form.title.trim() || form.content.trim() || form.tag_names.trim(),
  )
  const canSuggestTags = Boolean(form.title.trim() || form.content.trim())

  async function handleSimilarPostSearch() {
    if (!canSearchSimilarPosts) {
      setSimilarPosts([])
      setSimilarPostMessage('제목, 내용, 태그 중 하나 이상 입력해주세요.')
      return
    }

    setIsSimilarPostLoading(true)
    setSimilarPostMessage('비슷한 게시글을 찾는 중입니다.')

    try {
      const data = await getSimilarPosts({
        title: form.title,
        content: form.content,
        tag_names: parseTagNames(form.tag_names),
        limit: 5,
      })

      setSimilarPosts(data.items)
      setSimilarPostMessage(data.items.length ? '' : '아직 비슷한 게시글이 없습니다.')
    } catch (error) {
      setSimilarPosts([])
      setSimilarPostMessage(
        error instanceof Error ? error.message : '비슷한 게시글을 찾지 못했습니다.',
      )
    } finally {
      setIsSimilarPostLoading(false)
    }
  }

  async function handleAiTagSearch() {
    if (!canSuggestTags) {
      setAiTagSuggestions([])
      setAiTagMessage('제목이나 내용을 먼저 입력해주세요.')
      return
    }

    setIsAiTagLoading(true)
    setAiTagMessage('추천 태그를 찾는 중입니다.')

    try {
      const data = await getAiTagSuggestions({
        title: form.title,
        content: form.content,
        limit: 5,
      })

      setAiTagSuggestions(data.items)
      setAiTagMessage(data.items.length ? '' : '추천할 태그가 아직 없습니다.')
    } catch (error) {
      setAiTagSuggestions([])
      setAiTagMessage(error instanceof Error ? error.message : '태그를 추천하지 못했습니다.')
    } finally {
      setIsAiTagLoading(false)
    }
  }

  function addSuggestedTag(tagName: string) {
    const currentTags = parseTagNames(form.tag_names)

    if (currentTags.includes(tagName)) {
      return
    }

    onChange('tag_names', [...currentTags, tagName].join(', '))
  }

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            {isCreateMode ? '새 게시글' : '게시글 수정'}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            {isCreateMode ? '동네 가게 질문을 작성합니다' : '게시글 내용을 수정합니다'}
          </h2>
        </div>
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={onCancel}
          type="button"
        >
          취소
        </button>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">제목</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
            onChange={(event) => onChange('title', event.target.value)}
            placeholder="예: 정글 근처 조용한 카페 추천해주세요"
            type="text"
            value={form.title}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">내용</span>
          <textarea
            className="mt-1 min-h-40 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
            onChange={(event) => onChange('content', event.target.value)}
            placeholder="궁금한 점이나 경험을 자세히 적어주세요."
            value={form.content}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">동네</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
              onChange={(event) => onChange('region', event.target.value)}
              placeholder="예: 역삼동"
              type="text"
              value={form.region}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">가게명</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
              onChange={(event) => onChange('store_name', event.target.value)}
              placeholder="예: 정글카페"
              type="text"
              value={form.store_name}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">분류</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
              onChange={(event) => onChange('category', event.target.value)}
              placeholder="예: 맛집"
              type="text"
              value={form.category}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">태그</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
            onChange={(event) => onChange('tag_names', event.target.value)}
            placeholder="예: 조용한카페, 공부, 점심"
            type="text"
            value={form.tag_names}
          />
          {!isCreateMode && (
            <p className="mt-1 text-xs text-slate-500">
              현재 백엔드는 게시글 수정 시 태그 변경을 저장하지 않습니다.
            </p>
          )}
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">AI 태그 추천</h3>
                <p className="mt-1 text-xs text-slate-600">
                  제목과 내용을 보고 기존 게시글에 많이 쓰인 태그를 추천합니다.
                </p>
              </div>
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isAiTagLoading || !canSuggestTags}
                onClick={handleAiTagSearch}
                type="button"
              >
                {isAiTagLoading ? '추천 중' : '태그 추천'}
              </button>
            </div>

            {aiTagMessage && <p className="mt-3 text-sm text-slate-600">{aiTagMessage}</p>}

            {aiTagSuggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {aiTagSuggestions.map((tag) => (
                  <button
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                    key={tag.name}
                    onClick={() => addSuggestedTag(tag.name)}
                    type="button"
                  >
                    {tag.name} · {tag.score}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">비슷한 게시글</h3>
                <p className="mt-1 text-xs text-slate-600">
                  현재 입력한 제목, 내용, 태그와 겹치는 기존 게시글을 찾습니다.
                </p>
              </div>
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isSimilarPostLoading || !canSearchSimilarPosts}
                onClick={handleSimilarPostSearch}
                type="button"
              >
                {isSimilarPostLoading ? '찾는 중' : '비슷한 글 찾기'}
              </button>
            </div>

            {similarPostMessage && (
              <p className="mt-3 text-sm text-slate-600">{similarPostMessage}</p>
            )}
          </div>
        </div>

        {similarPosts.length > 0 && (
          <div className="grid gap-3">
            {similarPosts.map((post) => (
              <article className="rounded-md border border-slate-200 bg-white p-4" key={post.id}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">{post.title}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {post.content_preview}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    유사도 {post.score}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {post.region && <span>{post.region}</span>}
                  {post.store_name && <span>{post.store_name}</span>}
                  {post.category && <span>{post.category}</span>}
                  <span>{formatDate(post.created_at)}</span>
                </div>

                {post.matched_keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {post.matched_keywords.map((keyword) => (
                      <span
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
                        key={keyword}
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <button
          className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isLoading}
          type="submit"
        >
          {isCreateMode ? '등록' : '수정 완료'}
        </button>
      </form>
    </section>
  )
}
