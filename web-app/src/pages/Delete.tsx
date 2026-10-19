import { useEffect, useState } from "react";
import {
  Button,
  Container,
  Flex,
  Heading,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Header } from "@/components/Header";
import type { Transaction } from "@/hooks/transactions";
import { useNavigate } from "react-router";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function DeletePage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const response = await fetch(`${BASE_URL}/transactions?type=all`);
        if (!response.ok) {
          throw new Error("取引一覧の取得に失敗しました");
        }
        const data = (await response.json()) as { transactions: Transaction[] };
        setTransactions(data.transactions);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "取引一覧の取得に失敗しました",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTransactions();
  }, []);

  const handleDelete = async (transaction: Transaction) => {
    if (!window.confirm(`「${transaction.item}」を削除しますか？`)) {
      return;
    }

    setDeletingId(transaction.id);
    setError(null);
    try {
      const response = await fetch(
        `${BASE_URL}/transactions/${transaction.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("取引の削除に失敗しました");
      }
      setTransactions((current) =>
        current.filter((item) => item.id !== transaction.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "取引の削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Header />
      <Container as="main" maxW="4xl" py={10}>
        <Stack gap={6}>
          <Flex justifyContent="space-between" alignItems="center">
            <Heading size="lg">取引の削除</Heading>
            <Button variant="outline" onClick={() => navigate("/")}>
              戻る
            </Button>
          </Flex>

          {error && <Text color="red.500">{error}</Text>}
          {isLoading ? (
            <Text>取引を読み込んでいます...</Text>
          ) : transactions.length === 0 ? (
            <Text>削除できる取引はありません。</Text>
          ) : (
            <Stack gap={3}>
              {transactions.map((transaction) => (
                <Flex
                  key={transaction.id}
                  justifyContent="space-between"
                  alignItems="center"
                  gap={4}
                  borderWidth="1px"
                  borderRadius="md"
                  p={4}
                >
                  <Stack gap={1}>
                    <Text fontWeight="bold">{transaction.item}</Text>
                    <Text color="gray.500" fontSize="sm">
                      {formatDate(transaction.date)}
                    </Text>
                  </Stack>
                  <Flex alignItems="center" gap={4}>
                    <Text
                      color={transaction.amount > 0 ? "green.500" : "red.500"}
                      fontWeight="bold"
                    >
                      {transaction.amount.toLocaleString()}円
                    </Text>
                    <Button
                      colorPalette="red"
                      variant="outline"
                      onClick={() => void handleDelete(transaction)}
                      disabled={deletingId !== null}
                      loading={deletingId === transaction.id}
                    >
                      削除
                    </Button>
                  </Flex>
                </Flex>
              ))}
            </Stack>
          )}
        </Stack>
      </Container>
    </>
  );
}

const formatDate = (dateString: string): string => {
  const [year, month, day] = dateString.split("-");
  return `${year}年${month}月${day}日`;
};

export default DeletePage;
