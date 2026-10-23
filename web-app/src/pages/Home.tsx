import { useEffect, useState } from "react";
import {
  Button,  
  Container, 
  Flex,
  Card,
  Heading,
  Grid,
  GridItem,
  Text,
} from "@chakra-ui/react";
import {FaPlus, FaTrash} from "react-icons/fa";
import {
  RecentIncomeTransactionList,
  RecentExpenseTransactionList,
} from "@/components/TransactionList";
import {Header} from "@/components/Header";
import {useNavigate} from "react-router";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; userId: string }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

function Home(){
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const checkSession = async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/me`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (response.status === 401) {
          setSession({ status: "unauthenticated" });
          return;
        }
        if (!response.ok) {
          throw new Error(`ログイン状態の確認に失敗しました (${response.status})`);
        }

        const result = (await response.json()) as { userId: string };
        setSession({ status: "authenticated", userId: result.userId });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setSession({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "ログイン状態を確認できませんでした。",
        });
      }
    };

    void checkSession();
    return () => controller.abort();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`ログアウトに失敗しました (${response.status})`);
      }

      setSession({ status: "unauthenticated" });
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "ログアウトに失敗しました。",
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  return(
    <>
      <Header />
      <Container as="main" maxW="4xl" py={10}>
        <Grid templateColumns="repeat(2, 1fr)" gap={6}>
          <GridItem colSpan={2}>
            <Flex justifyContent="flex-end" gap={3}>
              {session.status === "authenticated" ? (
                <>
                  <Text alignSelf="center">ログイン中: {session.userId}</Text>
                  {logoutError && (
                    <Text role="alert" color="red.600" alignSelf="center">
                      {logoutError}
                    </Text>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => void handleLogout()}
                    loading={isLoggingOut}
                    disabled={isLoggingOut}
                  >
                    ログアウト
                  </Button>
                </>
              ) : session.status === "loading" ? (
                <Text alignSelf="center">ログイン状態を確認中...</Text>
              ) : (
                <>
                  {session.status === "error" && (
                    <Text role="alert" color="red.600" alignSelf="center">
                      {session.message}
                    </Text>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => navigate("/login")}
                  >
                    ログイン
                  </Button>
                  <Button
                    colorPalette="teal"
                    variant="outline"
                    onClick={() => navigate("/signup")}
                  >
                    サインアップ
                  </Button>
                </>
              )}
              <Button
                colorPalette="red"
                variant="outline"
                fontWeight="bold"
                onClick={() => navigate("/delete")}
              >
                <FaTrash />
                削除
              </Button>
              <Button 
                colorPalette="teal" 
                fontWeight="bold" 
                onClick={() => navigate("/input")}
              >
                <FaPlus/>
                登録
              </Button>
            </Flex>
          </GridItem>
          <GridItem>
            <SummaryCard title="収入履歴">
              <RecentIncomeTransactionList maxTransactions={3} />
            </SummaryCard>
          </GridItem>
          <GridItem>
            <SummaryCard title="支出履歴">
              <RecentExpenseTransactionList maxTransactions={3} />
            </SummaryCard>
          </GridItem>
        </Grid>
      </Container>
    </>
  );
}

const SummaryCard: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({title, children}) => {
  return (
    <Card.Root variant="elevated">
      <Card.Header>
        <Heading size="md">{title}</Heading>
      </Card.Header>
      <Card.Body>{children}</Card.Body>
    </Card.Root>
  )
}

export default Home;