import Header from "./Header";


function Layout({ auth, children }) {
  return (
    <div className="app-shell">
      <aside className="top-ad-banner" aria-label="top advertisement">
        <img src="/ads/miku-top.jpg" alt="Hatsune Miku banner advertisement" />
      </aside>

      <div className="below-banner-layout">
        <aside className="side-ad-stack side-ad-stack-left" aria-label="left side advertisements">
          <img src="/ads/miku-left-top-replacement.gif" alt="Hatsune Miku left side animation advertisement" />
          <img src="/ads/miku-left-second-replacement.gif" alt="Hatsune Miku animated figure advertisement" />
          <img src="/ads/miku-left-third-insert.gif" alt="Hatsune Miku guitar animation advertisement" />
          <img src="/ads/miku-left-fourth-insert.gif" alt="Hatsune Miku trio stage animation advertisement" />
          <img src="/ads/miku-left-project-diva-x.jpg" alt="Hatsune Miku Project DIVA X advertisement" />
          <img src="/ads/miku-left-sixth-replacement.gif" alt="Hatsune Miku keyboard animation advertisement" />
          <img src="/ads/miku-left-header.jpg" alt="Hatsune Miku left side banner advertisement" />
        </aside>

        <div className="content-column">
          <Header auth={auth} />

          <main className="layout-main" aria-label="page content">
            {children}
          </main>
        </div>

        <aside className="side-ad-stack side-ad-stack-right" aria-label="right side advertisements">
          <img src="/ads/miku-side-top-replacement.gif" alt="Hatsune Miku right side animation advertisement" />
          <img src="/ads/miku-side-second-replacement.gif" alt="Hatsune Miku full-body animated figure advertisement" />
          <img src="/ads/miku-side-third-replacement.gif" alt="Hatsune Miku rhythm game animation advertisement" />
          <img src="/ads/miku-side-extra-2.jpg" alt="Hatsune Miku cat ear figure advertisement" />
          <img src="/ads/miku-side-fourth-insert.gif" alt="Hatsune Miku snow stage animation advertisement" />
          <img src="/ads/miku-lucky-star.jpg" alt="Hatsune Miku Lucky Star figure advertisement" />
        </aside>
      </div>
    </div>
  );
}


export default Layout;
