import { NavLink } from "react-router-dom";

import { BOARD_TYPES } from "../../constants/boardTypes";


function Header() {
  return (
    <header className="site-header">
      <nav className="header-nav" aria-label="main navigation">
        <NavLink className="nav-link" to="/">
          홈
        </NavLink>

        {BOARD_TYPES.map((board) => (
          <NavLink
            className="nav-link"
            key={board.code}
            to={`/boards/${board.code}`}
          >
            {board.name}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}


export default Header;
