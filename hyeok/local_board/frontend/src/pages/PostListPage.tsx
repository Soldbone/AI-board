import type { FormEvent } from 'react'
import type { PostListItem, PostSort } from '../api/postApi'
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
  sort: PostSort
  onKeywordInputChange: (value: string) => void
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClearFilters: () => void
  onSelectSuggestion: (suggestion: TagSuggestion) => void
  onSortChange: (sort: PostSort) => void
  onOpenDetail: (postId: number) => void
  onLoadPage: (page: number) => void
  formatDate: (value: string) => string
}

const sortOptions: { value: PostSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'views', label: '조회수 많은 순' },
  { value: 'comments', label: '댓글 많은 순' },
]

export function PostListPage({
  posts,
  tags,
  page,
  totalPages,
  isLoading,
  keywordInput,
  activeKeyword,
  activeTag,
  sort,
  onKeywordInputChange,
  onSearchSubmit,
  onClearFilters,
  onSelectSuggestion,
  onSortChange,
  onOpenDetail,
  onLoadPage,
  formatDate,
}: PostListPageProps) {
  return (
    <section className="space-y-4">
      <form
        className="grid gap-2 rounded-lg bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"
        onSubmit={onSearchSubmit}
      >
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          onChange={(event) => onKeywordInputChange(event.target.value)}
          placeholder="제목, 내용, 태그로 검색"
          type="search"
          value={keywordInput}
        />
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          type="submit"
        >
          검색
        </button>
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={onClearFilters}
          type="button"
        >
          초기화
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {sortOptions.map((option) => (
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              sort === option.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'
            }`}
            key={option.value}
            onClick={() => onSortChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                activeTag === tag.name || activeKeyword === tag.name
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'
              }`}
              key={tag.id}
              onClick={() => onSelectSuggestion(tag)}
              type="button"
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {posts.length === 0 && !isLoading && (
          <p className="rounded-lg bg-white p-5 text-sm text-slate-500 shadow-sm md:col-span-2">
            표시할 게시글이 없습니다.
          </p>
        )}

        {posts.map((post) => (
          <article className="flex min-h-40 flex-col rounded-lg bg-white p-5 shadow-sm" key={post.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {post.region && <span>{post.region}</span>}
              {post.category && <span>{post.category}</span>}
              {post.store_name && <span>{post.store_name}</span>}
            </div>
            <button
              className="line-clamp-2 text-left text-lg font-semibold leading-7 text-slate-950 hover:text-emerald-700"
              onClick={() => onOpenDetail(post.id)}
              type="button"
            >
              {post.title}
            </button>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-5 text-xs text-slate-400">
              <span>작성일 {formatDate(post.created_at)}</span>
              <span>조회 {post.view_count}</span>
              <span>댓글 {post.comment_count}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={page <= 1 || isLoading}
          onClick={() => onLoadPage(page - 1)}
          type="button"
        >
          이전
        </button>
        <span className="text-sm text-slate-600">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
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
