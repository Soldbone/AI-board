import type { FormEvent } from 'react'
import type { PostListItem, PostSort, PostTypeFilter } from '../api/postApi'
import type { TagSuggestion } from '../api/tagApi'

type PostListPageProps = {
  posts: PostListItem[]
  tags: TagSuggestion[]
  page: number
  totalPages: number
  isLoading: boolean
  keywordInput: string
  activeKeyword: string
  activeTag: string
  activePostType: PostTypeFilter
  sort: PostSort
  onKeywordInputChange: (value: string) => void
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClearFilters: () => void
  onSelectSuggestion: (suggestion: TagSuggestion) => void
  onPostTypeChange: (postType: PostTypeFilter) => void
  onSortChange: (sort: PostSort) => void
  onOpenDetail: (postId: number) => void
  onLoadPage: (page: number) => void
  formatDate: (value: string) => string
}

const sortOptions: { value: PostSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'views', label: '조회 많은 순' },
  { value: 'comments', label: '댓글 많은 순' },
]

const postTypeOptions: { value: PostTypeFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'question', label: '질문' },
  { value: 'review', label: '실제후기' },
]

function getPostTypeLabel(postType: PostListItem['post_type']) {
  return postType === 'review' ? '실제후기' : '질문'
}

export function PostListPage({
  posts,
  tags,
  page,
  totalPages,
  isLoading,
  keywordInput,
  activeKeyword,
  activeTag,
  activePostType,
  sort,
  onKeywordInputChange,
  onSearchSubmit,
  onClearFilters,
  onSelectSuggestion,
  onPostTypeChange,
  onSortChange,
  onOpenDetail,
  onLoadPage,
  formatDate,
}: PostListPageProps) {
  const hasFilter = Boolean(activeKeyword || activeTag || activePostType !== 'all')

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">동네 글 찾기</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              궁금한 가게와 후기를 빠르게 찾아보세요
            </h2>
          </div>
          {hasFilter && (
            <button
              className="w-fit rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              onClick={onClearFilters}
              type="button"
            >
              필터 초기화
            </button>
          )}
        </div>

        <form className="grid gap-2 md:grid-cols-[1fr_auto]" onSubmit={onSearchSubmit}>
          <input
            className="h-11 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onKeywordInputChange(event.target.value)}
            placeholder="제목, 내용, 가게명으로 검색"
            type="search"
            value={keywordInput}
          />
          <button
            className="h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            type="submit"
          >
            검색
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {postTypeOptions.map((option) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                activePostType === option.value
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              key={option.value}
              onClick={() => onPostTypeChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sortOptions.map((option) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                sort === option.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              key={option.value}
              onClick={() => onSortChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-800">인기 태그</p>
            <p className="text-xs text-slate-500">{tags.length}개</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  activeTag === tag.name || activeKeyword === tag.name
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                }`}
                key={tag.id}
                onClick={() => onSelectSuggestion(tag)}
                type="button"
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {posts.length === 0 && !isLoading && (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm md:col-span-2">
            표시할 게시글이 없습니다.
          </p>
        )}

        {posts.map((post) => (
          <article
            className="flex min-h-44 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            key={post.id}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  post.post_type === 'review'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-800'
                }`}
              >
                {getPostTypeLabel(post.post_type)}
              </span>
              {post.region && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                  {post.region}
                </span>
              )}
              {post.category && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                  {post.category}
                </span>
              )}
              {post.store_name && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                  {post.store_name}
                </span>
              )}
            </div>

            <button
              className="line-clamp-2 text-left text-lg font-bold leading-7 text-slate-950 transition hover:text-emerald-700"
              onClick={() => onOpenDetail(post.id)}
              type="button"
            >
              {post.title}
            </button>

            <div className="mt-auto flex flex-wrap items-center gap-3 pt-5 text-xs text-slate-500">
              <span>{formatDate(post.created_at)}</span>
              <span>조회 {post.view_count}</span>
              <span>댓글 {post.comment_count}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={page <= 1 || isLoading}
          onClick={() => onLoadPage(page - 1)}
          type="button"
        >
          이전
        </button>
        <span className="text-sm font-medium text-slate-600">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={page >= totalPages || isLoading}
          onClick={() => onLoadPage(page + 1)}
          type="button"
        >
          다음
        </button>
      </div>
    </section>
  )
}
