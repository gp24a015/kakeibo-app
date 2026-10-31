import { useCallback, useEffect, useRef, useState } from "react";
import {BrowserRouter, Route, Routes} from "react-router";
import { Box, Button, HStack, Text } from "@chakra-ui/react";
import Home from "@/pages/Home";
import InputPage from "@/pages/Input";
import DeletePage from "@/pages/Delete";
import AuthPage from "@/pages/Auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function App() {
  const [bootstrapError, setBootstrapError] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [routerKey, setRouterKey] = useState(0);
  const hasInitializedRef = useRef(false);

  const initializeSession = useCallback(async () => {
    setBootstrapError("");
    setIsInitializing(true);

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
          let serverMessage = "";
          try {
            const result: unknown = await guestResponse.json();
            if (
              typeof result === "object" &&
              result !== null &&
              "message" in result &&
              typeof result.message === "string"
            ) {
              serverMessage = ` ${result.message}`;
            }
          } catch {
            // The server may return a non-JSON error response.
          }
          throw new Error(
            `ゲスト利用を開始できませんでした（HTTP ${guestResponse.status}）。${serverMessage} バックエンドのDB移行SQLが実行済みか、バックエンドが最新コードでデプロイされているか確認してください。`,
          );
        }
      } else if (!sessionResponse.ok) {
        throw new Error(
          `ログイン状態を確認できませんでした（HTTP ${sessionResponse.status}）。`,
        );
      }
      setIsInitialized(true);
      setRouterKey((key) => key + 1);
    } catch (error) {
      setBootstrapError(
        error instanceof Error
          ? error.message
          : "サーバーに接続できませんでした。",
      );
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    void initializeSession();
  }, [initializeSession]);

  if (!isInitialized && !bootstrapError) {
    return <p>利用を準備しています...</p>;
  }

  return (
    <>
      {bootstrapError && (
        <Box role="alert" bg="orange.100" color="orange.900" p={3}>
          <HStack justify="space-between" align="start">
            <Text>{bootstrapError}</Text>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void initializeSession()}
              loading={isInitializing}
              disabled={isInitializing}
            >
              再試行
            </Button>
          </HStack>
        </Box>
      )}
      <BrowserRouter key={routerKey}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/input" element={<InputPage />} />
          <Route path="/delete" element={<DeletePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;