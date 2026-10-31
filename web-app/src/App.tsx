import { useCallback, useEffect, useRef, useState } from "react";
import {BrowserRouter, Route, Routes} from "react-router";
import Home from "@/pages/Home";
import InputPage from "@/pages/Input";
import DeletePage from "@/pages/Delete";
import AuthPage from "@/pages/Auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function App() {
  const [bootstrapError, setBootstrapError] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const hasInitializedRef = useRef(false);

  const initializeSession = useCallback(async () => {
    setBootstrapError("");

    try {
      const sessionResponse = await fetch(`${BASE_URL}/auth/me`, {
        credentials: "include",
      });

      if (sessionResponse.status === 401) {
        const guestResponse = await fetch(`${BASE_URL}/auth/guest`, {
          method: "POST",
          credentials: "include",
        });
        if (!guestResponse.ok) {
          throw new Error("ゲスト利用を開始できませんでした。");
        }
      } else if (!sessionResponse.ok) {
        throw new Error("ログイン状態を確認できませんでした。");
      }
      setIsInitialized(true);
    } catch (error) {
      setBootstrapError(
        error instanceof Error
          ? error.message
          : "サーバーに接続できませんでした。",
      );
    }
  }, []);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    void initializeSession();
  }, [initializeSession]);

  if (bootstrapError) {
    return (
      <p role="alert">
        {bootstrapError}{" "}
        <button type="button" onClick={() => void initializeSession()}>
          再試行
        </button>
      </p>
    );
  }

  if (!isInitialized) {
    return <p>利用を準備しています...</p>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/input" element={<InputPage />} />
        <Route path="/delete" element={<DeletePage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;