import { useState, type FormEvent } from 'react'
import type { AgentPlaceRecommendationResponse, AgentRecommendedPlace } from '../api/agentApi'
import type { SimilarPostItem } from '../api/aiApi'
import type { CommentRead } from '../api/commentApi'
import type { PostRead } from '../api/postApi'

function getPlaceAddress(place: AgentRecommendedPlace) {
  return place.road_address || place.address || '주소 정보 없음'
}

function buildFallbackMapUrl(place: AgentRecommendedPlace, region?: string | null) {
  const query = [region, place.title].filter(Boolean).join(' ')
  return `https://map.naver.com/p/search/${encodeURIComponent(query || place.title)}`
}

type PostDetailPageProps = {
  post: PostRead | null
  comments: CommentRead[]
  agentRecommendation: AgentPlaceRecommendationResponse | null
  similarPosts: SimilarPostItem[]
  similarPostMessage: string
  commentContent: string
  isAnonymous: boolean
  replyTargetId: number | null
  isLoading: boolean
  isAgentLoading: boolean
  isSimilarPostLoading: boolean
  hasAccessToken: boolean
  currentUserId: number | null
  onBack: () => void
  onEdit: () => void
  onDeletePost: () => void
  onDeleteComment: (commentId: number) => void
  onRequestAgentRecommendation: () => void
  onOpenSimilarPost: (postId: number) => void
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
  agentRecommendation,
  similarPosts,
  similarPostMessage,
  commentContent,
  isAnonymous,
  replyTargetId,
  isLoading,
  isAgentLoading,
  isSimilarPostLoading,
  hasAccessToken,
  currentUserId,
  onBack,
  onEdit,
  onDeletePost,
  onDeleteComment,
  onRequestAgentRecommendation,
  onOpenSimilarPost,
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
  const [openSimilarPostId, setOpenSimilarPostId] = useState<number | null>(null)

  if (!post) {
    return (
      <section className="rounded-lg bg-white px-6 py-8 shadow-sm">
        <p className="text-sm text-slate-600">게시글을 불러오는 중입니다.</p>
      </section>
    )
  }

  const canManagePost = currentUserId === post.author_id
  const isSimilarPostOpen = openSimilarPostId === post.id

  return (
    <section className="rounded-lg bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
      <article>
        <header className="border-b border-slate-200 pb-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
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

          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-bold uppercase text-emerald-700">
                게시글
              </p>
              <h2 className="break-words text-2xl font-bold leading-9 text-slate-950 md:text-3xl">
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
        </header>

        <section className="border-b border-slate-200 py-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-5 w-1 rounded-full bg-slate-900" aria-hidden="true" />
            <h3 className="text-base font-bold text-slate-950">본문</h3>
          </div>
          <p className="whitespace-pre-wrap break-words text-base leading-8 text-slate-800">
            {post.content}
          </p>
        </section>
      </article>

      <section className="border-b border-slate-200 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="h-5 w-1 rounded-full bg-emerald-600" aria-hidden="true" />
            <h3 className="text-xl font-bold text-slate-950">비슷한 게시글</h3>
          </div>

          <button
            aria-expanded={isSimilarPostOpen}
            className="w-fit rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => setOpenSimilarPostId(isSimilarPostOpen ? null : post.id)}
            type="button"
          >
            {isSimilarPostOpen ? '접기' : `열기${similarPosts.length ? ` ${similarPosts.length}` : ''}`}
          </button>
        </div>

        {isSimilarPostOpen && (
          <>
            {isSimilarPostLoading && (
              <p className="mt-5 text-sm text-slate-500">비슷한 게시글을 찾는 중입니다.</p>
            )}

            {!isSimilarPostLoading && similarPostMessage && (
              <p className="mt-5 text-sm text-slate-500">{similarPostMessage}</p>
            )}

            {similarPosts.length > 0 && (
              <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                {similarPosts.map((similarPost) => (
                  <article className="py-4" key={similarPost.id}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <button
                          className="break-words text-left text-sm font-bold text-slate-950 transition hover:text-emerald-700"
                          onClick={() => onOpenSimilarPost(similarPost.id)}
                          type="button"
                        >
                          {similarPost.title}
                        </button>
                        <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-600">
                          {similarPost.content_preview}
                        </p>
                      </div>
                      <span className="w-fit shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        유사도 {similarPost.score}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {similarPost.region && <span>{similarPost.region}</span>}
                      {similarPost.store_name && <span>{similarPost.store_name}</span>}
                      {similarPost.category && <span>{similarPost.category}</span>}
                      <span>{formatDate(similarPost.created_at)}</span>
                    </div>

                    {similarPost.matched_keywords.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {similarPost.matched_keywords.map((keyword) => (
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
          </>
        )}
      </section>

      <section className="border-b border-slate-200 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">
              AI 추천
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">네이버 기반 장소 추천</h3>
          </div>

          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isAgentLoading || isLoading}
            onClick={onRequestAgentRecommendation}
            type="button"
          >
            {isAgentLoading ? '추천 중...' : 'AI 장소 추천'}
          </button>
        </div>

        {agentRecommendation && (
          <div className="mt-6">
            {agentRecommendation.places.length > 0 && (
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {agentRecommendation.places.map((place) => {
                  const mapUrl = place.naver_map_url || buildFallbackMapUrl(place, post.region)

                  return (
                    <article
                      className="grid gap-4 py-5 md:grid-cols-[180px_1fr]"
                      key={`${place.title}-${mapUrl}`}
                    >
                      <div className="h-36 overflow-hidden rounded-md bg-slate-100 md:h-32">
                        {place.image_url ? (
                          <img
                            alt={`${place.title} 대표 이미지`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            src={place.image_url}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-400">
                            이미지 없음
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <h4 className="break-words text-lg font-bold text-slate-950">
                              {place.title}
                            </h4>
                            {place.category && (
                              <p className="mt-1 text-xs font-semibold text-emerald-700">
                                {place.category}
                              </p>
                            )}
                          </div>
                          <a
                            className="inline-flex shrink-0 items-center justify-center rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                            href={mapUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            지도 보기
                          </a>
                        </div>

                        <p className="mt-3 break-words text-sm leading-6 text-slate-600">
                          {getPlaceAddress(place)}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {place.link && (
                            <a
                              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              href={place.link}
                              rel="noreferrer"
                              target="_blank"
                            >
                              상세 링크
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            {agentRecommendation.places.length === 0 && agentRecommendation.fallback_map_url && (
              <div className="border-y border-slate-200 py-5">
                <p className="text-sm text-slate-600">
                  추천할 장소를 찾지 못했습니다. 네이버 지도에서 직접 검색해보세요.
                </p>
                <a
                  className="mt-3 inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  href={agentRecommendation.fallback_map_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  네이버 지도에서 직접 보기
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="pt-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-5 w-1 rounded-full bg-emerald-600" aria-hidden="true" />
            <div>
              <h3 className="text-xl font-bold text-slate-950">
                댓글 {visibleCommentCount}개
              </h3>
            </div>
          </div>
        </div>

        <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
          {comments.length === 0 && (
            <p className="py-6 text-sm text-slate-500">아직 댓글이 없습니다.</p>
          )}

          {comments.map((comment) => (
            <article
              className={`py-4 ${comment.parent_id ? 'ml-6 border-l-2 border-emerald-200 pl-4' : ''}`}
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
                      <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        익명
                      </span>
                    )}
                  </div>
                )}

                {!comment.is_deleted && (
                  <div className="flex shrink-0 items-center gap-1">
                    {comment.parent_id === null && (
                      <button
                        className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
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
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {comment.content}
              </p>
            </article>
          ))}
        </div>

        <form className="mt-6" onSubmit={onCreateComment}>
          {replyTargetId !== null && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>@{replyTargetNickname}에게 답글 작성 중</span>
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
