import { useEffect, useState } from "react";

import { healthCheck } from "./api/client";
import { useAuth } from "./hooks/useAuth";
import AppRouter from "./routes/Router";


function App() {
  const [connectionStatus, setConnectionStatus] = useState("loading");
  const [healthResponse, setHealthResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const auth = useAuth();

  useEffect(() => {
    let ignore = false;

    async function checkBackendConnection() {
      try {
        const data = await healthCheck();

        if (!ignore) {
          setHealthResponse(data);
          setConnectionStatus("connected");
          setErrorMessage("");
        }
      } catch (error) {
        if (!ignore) {
          setConnectionStatus("failed");
          setErrorMessage(error.message);
        }
      }
    }

    checkBackendConnection();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <AppRouter
      auth={auth}
      connectionErrorMessage={errorMessage}
      connectionStatus={connectionStatus}
      healthResponse={healthResponse}
    />
  );
}


export default App;
