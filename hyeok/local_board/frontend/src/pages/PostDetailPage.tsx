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
  onBack: () => void
  onEdit: () => void
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
  onBack,
  onEdit,
  onReplyTargetChange,
  onCancelReply,
  onCommentContentChange,
  onAnonymousChange,
  onCreateComment,
  formatDate,
}: PostDetailPageProps) {
  const replyTargetComment = comments.find((comment) => comment.id === replyTargetId)
  const replyTargetNickname = replyTargetComment?.author_nickname ?? '알 수 없음'

  if (!post) {
    return <section className="rounded-lg bg-white p-6 shadow-sm">게시글을 불러오는 중입니다.</section>
  }

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {post.region && <span>{post.region}</span>}
            {post.category && <span>{post.category}</span>}
            {post.store_name && <span>{post.store_name}</span>}
          </div>
          <h2 className="text-2xl font-bold text-slate-950">{post.title}</h2>
          <p className="mt-2 text-xs text-slate-400">
            작성일 {formatDate(post.created_at)} · 수정일 {formatDate(post.updated_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={onBack} type="button">
            목록
          </button>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!hasAccessToken} onClick={onEdit} type="button">
            수정
          </button>
        </div>
      </div>

      <p className="whitespace-pre-wrap text-base leading-7 text-slate-800">{post.content}</p>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-950">댓글</h3>
          <span className="text-sm text-slate-500">{comments.length}개</span>
        </div>

        <div className="mt-4 space-y-3">
          {comments.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">아직 댓글이 없습니다.</p>}
          {comments.map((comment) => (
            <article className={`rounded-md bg-slate-50 p-4 ${comment.parent_id ? 'ml-6 border-l-4 border-emerald-200' : ''}`} key={comment.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong className="text-sm text-slate-900">{comment.author_nickname}</strong>
                  <span className="ml-2 text-xs text-slate-400">{formatDate(comment.created_at)}</span>
                  {comment.is_anonymous && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">익명</span>}
                </div>
                {comment.parent_id === null && (
                  <button className="text-xs font-medium text-emerald-700 hover:text-emerald-900" onClick={() => onReplyTargetChange(comment.id)} type="button">
                    답글
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</p>
            </article>
          ))}
        </div>

        <form className="mt-5 space-y-3" onSubmit={onCreateComment}>
          {replyTargetId !== null && (
            <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>@{replyTargetNickname}의 댓글에 답글 작성 중</span>
              <button className="font-medium" onClick={onCancelReply} type="button">취소</button>
            </div>
          )}
          <textarea className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500" onChange={(event) => onCommentContentChange(event.target.value)} placeholder="댓글을 입력하세요." value={commentContent} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input checked={isAnonymous} className="h-4 w-4" onChange={(event) => onAnonymousChange(event.target.checked)} type="checkbox" />
              익명으로 작성
            </label>
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={isLoading || !hasAccessToken} type="submit">
              댓글 등록
            </button>
          </div>
          {!hasAccessToken && <p className="text-sm text-slate-500">댓글 작성은 로그인이 필요합니다. 상단에서 로그인해주세요.</p>}
        </form>
      </div>
    </section>
  )
}
