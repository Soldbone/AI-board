import Header from "./Header";


function Layout({ children }) {
  return (
    <div className="app-shell">
      <Header />

      <main className="layout-main" aria-label="page content">
        {children}
      </main>
    </div>
  );
}


export default Layout;
