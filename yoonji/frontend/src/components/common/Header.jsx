import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { getBoards } from "../../api/boardApi";
import { BOARD_TYPES } from "../../constants/boardTypes";
import Button from "./Button";


function Header({ auth }) {
  const [boards, setBoards] = useState(BOARD_TYPES);
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    async function loadBoards() {
      try {
        const response = await getBoards();

        if (!ignore && response.items.length > 0) {
          setBoards(response.items);
        }
      } catch {
        if (!ignore) {
          setBoards(BOARD_TYPES);
        }
      }
    }

    loadBoards();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleLogout() {
    await auth.logout();
    navigate("/");
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <nav className="header-nav" aria-label="main navigation">
          <NavLink className="nav-link" to="/">
            홈
          </NavLink>
          <NavLink className="nav-link" to="/boards">
            게시글
          </NavLink>
          <NavLink className="nav-link" to="/search">
            검색
          </NavLink>
          {auth.isAuthenticated && (
            <NavLink className="nav-link" to="/mypage">
              마이페이지
            </NavLink>
          )}
        </nav>

        <div className="header-actions">
          {auth.isAuthenticated ? (
            <>
              <NavLink className="nav-link nav-link-strong" to="/posts/new">
                글쓰기
              </NavLink>
              <span className="header-user">{auth.user?.nickname || "사용자"}</span>
              <Button onClick={handleLogout} variant="ghost">
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <NavLink className="nav-link nav-link-strong" to="/login">
                로그인
              </NavLink>
              <NavLink className="nav-link" to="/signup">
                회원가입
              </NavLink>
            </>
          )}
        </div>
      </div>

      <div className="board-menu" aria-label="board menu">
        {boards.map((board) => (
          <NavLink
            className="board-menu-link"
            key={board.id || board.code}
            to={`/boards/${board.code}`}
          >
            {board.name}
          </NavLink>
        ))}
      </div>
    </header>
  );
}


export default Header;
