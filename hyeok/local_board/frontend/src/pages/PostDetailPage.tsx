import type { FormEvent } from 'react'
import type { CommentRead } from '../api/commentApi'
import type { PostRead } from '../api/postApi'

type PostDetailPageProps = {
  post: PostRead | null
  comments: CommentRead[]
  commentContent: string
  isAnonymous: boolean
  replyTargetId: number | null
  isLoading: boolean
  hasAccessToken: boolean
  currentUserId: number | null
  onBack: () => void
  onEdit: () => void
  onDeletePost: () => void
  onDeleteComment: (commentId: number) => void
  onReplyTargetChange: (commentId: number) => void
  onCancelReply: () => void
  onCommentContentChange: (value: string) => void
  onAnonymousChange: (value: boolean) => void
  onCreateComment: (event: FormEvent<HTMLFormElement>) => void
  formatDate: (value: string) => string
}

export function PostDetailPage({
  post,
  comments,
  commentContent,
  isAnonymous,
  replyTargetId,
  isLoading,
  hasAccessToken,
  currentUserId,
  onBack,
  onEdit,
  onDeletePost,
  onDeleteComment,
  onReplyTargetChange,
  onCancelReply,
  onCommentContentChange,
  onAnonymousChange,
  onCreateComment,
  formatDate,
}: PostDetailPageProps) {
  const replyTargetComment = comments.find((comment) => comment.id === replyTargetId)
  const replyTargetNickname = replyTargetComment?.author_nickname ?? '알 수 없음'
  const visibleCommentCount = comments.filter((comment) => !comment.is_deleted).length

  if (!post) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">게시글을 불러오는 중입니다.</p>
      </section>
    )
  }

  const canManagePost = currentUserId === post.author_id

  return (
    <section className="space-y-5">
      <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            {post.region && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                {post.region}
              </span>
            )}
            {post.category && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                {post.category}
              </span>
            )}
            {post.store_name && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                {post.store_name}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold leading-9 text-slate-950 md:text-3xl">
                {post.title}
              </h2>
              <p className="mt-3 text-xs text-slate-500">
                작성일 {formatDate(post.created_at)} · 수정일 {formatDate(post.updated_at)}
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={onBack}
                type="button"
              >
                목록
              </button>
              {canManagePost && (
                <>
                  <button
                    className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    onClick={onEdit}
                    type="button"
                  >
                    수정
                  </button>
                  <button
                    className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                    onClick={onDeletePost}
                    type="button"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="whitespace-pre-wrap text-base leading-8 text-slate-800">{post.content}</p>
        </div>
      </article>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">대화</p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">댓글 {visibleCommentCount}개</h3>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {comments.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              아직 댓글이 없습니다.
            </p>
          )}

          {comments.map((comment) => (
            <article
              className={`rounded-lg border p-4 ${
                comment.parent_id
                  ? 'ml-6 border-emerald-100 bg-emerald-50/40'
                  : 'border-slate-200 bg-slate-50'
              }`}
              key={comment.id}
            >
              <div className="flex items-center justify-between gap-3">
                {comment.is_deleted ? (
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-400">삭제된 댓글</span>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <strong className="text-sm text-slate-900">{comment.author_nickname}</strong>
                    <span className="ml-2 text-xs text-slate-400">
                      {formatDate(comment.created_at)}
                    </span>
                    {comment.is_anonymous && (
                      <span className="ml-2 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                        익명
                      </span>
                    )}
                  </div>
                )}

                {!comment.is_deleted && (
                  <div className="flex shrink-0 items-center gap-1">
                    {comment.parent_id === null && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        onClick={() => onReplyTargetChange(comment.id)}
                        type="button"
                      >
                        답글
                      </button>
                    )}
                    {hasAccessToken && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        onClick={() => onDeleteComment(comment.id)}
                        type="button"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {comment.content}
              </p>
            </article>
          ))}
        </div>

        <form className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={onCreateComment}>
          {replyTargetId !== null && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
              <span>@{replyTargetNickname}의 댓글에 답글 작성 중</span>
              <button className="font-semibold" onClick={onCancelReply} type="button">
                취소
              </button>
            </div>
          )}

          <textarea
            className="min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            onChange={(event) => onCommentContentChange(event.target.value)}
            placeholder="댓글을 입력하세요."
            value={commentContent}
          />

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={isAnonymous}
                className="h-4 w-4 accent-emerald-600"
                onChange={(event) => onAnonymousChange(event.target.checked)}
                type="checkbox"
              />
              익명으로 작성
            </label>
            <button
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isLoading || !hasAccessToken}
              type="submit"
            >
              댓글 등록
            </button>
          </div>

          {!hasAccessToken && (
            <p className="mt-3 text-sm text-slate-500">
              댓글 작성은 로그인이 필요합니다. 상단에서 로그인해주세요.
            </p>
          )}
        </form>
      </section>
    </section>
  )
}
