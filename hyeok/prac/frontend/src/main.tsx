import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_BASE_URL = "http://localhost:8000";

interface Post {
  id: number;
  content: string;
  created_at: string;
}

function App() {
  const [content, setContent] = React.useState("");
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  async function fetchPosts() {
    const response = await fetch(`${API_BASE_URL}/posts`);
    if (!response.ok) {
      throw new Error("게시글 목록을 불러오지 못했습니다.");
    }
    const data: Post[] = await response.json();
    setPosts(data);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setErrorMessage("내용을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: trimmedContent }),
      });

      if (!response.ok) {
        throw new Error("게시글 등록에 실패했습니다.");
      }

      setContent("");
      await fetchPosts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    fetchPosts().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "게시글 목록을 불러오지 못했습니다.");
    });
  }, []);

  return (
    <main className="page">
      <section className="board">
        <header className="board-header">
          <p className="eyebrow">React + FastAPI + PostgreSQL</p>
          <h1>아주 작은 게시판</h1>
        </header>

        <form className="post-form" onSubmit={handleSubmit}>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="텍스트를 입력하고 등록해보세요."
            rows={5}
          />
          <div className="form-footer">
            {errorMessage ? <p className="error">{errorMessage}</p> : <span />}
            <button type="submit" disabled={isLoading}>
              {isLoading ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>

        <section className="post-list" aria-label="게시글 목록">
          {posts.length === 0 ? (
            <p className="empty">아직 등록된 글이 없습니다.</p>
          ) : (
            posts.map((post) => (
              <article className="post-card" key={post.id}>
                <p>{post.content}</p>
                <time dateTime={post.created_at}>
                  {new Date(post.created_at).toLocaleString("ko-KR")}
                </time>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

