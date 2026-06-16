import { useAuth } from "./hooks/useAuth";
import AppRouter from "./routes/Router";


function App() {
  const auth = useAuth();

  return <AppRouter auth={auth} />;
}


export default App;
