import { useState, type FormEvent } from "react";
import {
  Button,
  Center,
  Container,
  Field,
  Heading,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Header } from "@/components/Header";
import { useNavigate } from "react-router";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

type AuthPageProps = {
  mode: "login" | "signup";
};

function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const isSignup = mode === "signup";
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (isSignup && password !== confirmPassword) {
      setMessage("パスワードが一致しません。");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${BASE_URL}/auth/${isSignup ? "signup" : "login"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ userId, password }),
        },
      );

      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(
          result.message ??
            (isSignup ? "登録に失敗しました。" : "ログインに失敗しました。"),
        );
        return;
      }

      if (isSignup) {
        navigate("/login");
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error(error);
      setMessage("サーバーに接続できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header />
      <Container as="main" maxW="md" py={10}>
        <Center>
          <form onSubmit={handleSubmit} style={{ width: "100%" }}>
            <Stack
              width="full"
              gap={5}
              borderWidth="1px"
              borderRadius="lg"
              p={6}
            >
            <Heading size="lg" textAlign="center">
              {isSignup ? "サインアップ" : "ログイン"}
            </Heading>

            <Field.Root required>
              <Field.Label>ID</Field.Label>
              <Input
                autoComplete="username"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="IDを入力してください"
              />
            </Field.Root>

            <Field.Root required>
              <Field.Label>パスワード</Field.Label>
              <Input
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="パスワードを入力してください"
              />
            </Field.Root>

            {isSignup && (
              <Field.Root required>
                <Field.Label>パスワード（確認）</Field.Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="パスワードをもう一度入力してください"
                />
              </Field.Root>
            )}

            {message && (
              <Text role="status" color="orange.700">
                {message}
              </Text>
            )}

            <Stack gap={3}>
              <Button
                  type="submit"
                  colorPalette="teal"
                  fontWeight="bold"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {isSignup ? "登録する" : "ログイン"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                家計簿に戻る
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(isSignup ? "/login" : "/signup")}
              >
                {isSignup
                  ? "すでにアカウントをお持ちの方はこちら"
                  : "アカウントをお持ちでない方はこちら"}
              </Button>
            </Stack>
            </Stack>
          </form>
        </Center>
      </Container>
    </>
  );
}

export default AuthPage;
