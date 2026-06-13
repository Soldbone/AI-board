import { NavLink, useNavigate } from "react-router-dom";

import { BOARD_TYPES } from "../../constants/boardTypes";
import Button from "./Button";


function Header({ auth }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await auth.logout();
    navigate("/");
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <nav className="header-nav" aria-label="main navigation">
          <NavLink className="nav-link nav-link-index nav-link-accent" to="/">
            홈
          </NavLink>

          {BOARD_TYPES.map((board) => (
            <NavLink
              className="nav-link nav-link-index"
              key={board.code}
              to={`/boards/${board.code}`}
            >
              {board.name}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions" aria-label="account actions">
          {auth.isAuthenticated ? (
            <>
              <NavLink className="nav-link" to="/mypage">
                마이페이지
              </NavLink>
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
              <NavLink className="nav-link nav-link-accent" to="/login">
                로그인
              </NavLink>
              <NavLink className="nav-link" to="/signup">
                회원가입
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}


export default Header;
