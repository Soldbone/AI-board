import Header from "./Header";


function Layout({ auth, children }) {
  return (
    <div className="app-shell">
      <Header auth={auth} />

      <main className="layout-main" aria-label="page content">
        {children}
      </main>
    </div>
  );
}


export default Layout;
