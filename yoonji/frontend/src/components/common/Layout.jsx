import Header from "./Header";


function Layout({ auth, children }) {
  return (
    <div className="app-shell">
      <aside className="top-ad-banner" aria-label="top advertisement">
        <img src="/ads/miku-top.jpg" alt="Hatsune Miku banner advertisement" />
      </aside>

      <div className="below-banner-layout">
        <aside className="side-ad-stack side-ad-stack-left" aria-label="left side advertisements">
          <img src="/ads/miku-left-top.jpg" alt="Hatsune Miku left side advertisement" />
          <img src="/ads/miku-left-bottom.jpg" alt="Hatsune Miku widget advertisement" />
          <img src="/ads/miku-left-bottom-extra.jpg" alt="Hatsune Miku fashion advertisement" />
        </aside>

        <div className="content-column">
          <Header auth={auth} />

          <main className="layout-main" aria-label="page content">
            {children}
          </main>
        </div>

        <aside className="side-ad-stack side-ad-stack-right" aria-label="right side advertisements">
          <img src="/ads/miku-side-top.jpg" alt="Hatsune Miku side advertisement" />
          <img src="/ads/miku-side-bottom.jpg" alt="Hatsune Miku poster advertisement" />
        </aside>
      </div>
    </div>
  );
}


export default Layout;
