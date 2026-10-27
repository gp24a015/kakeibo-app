import {useAddTransactions} from "../hooks/useAddTransactions";
import { Header } from "@/components/Header";
import {
  Card,
  Button,
  Center,
  Container,
  Field,
  Heading,
  HStack,
  Input,
  RadioGroup,
  Text,
  VStack,
} from "@chakra-ui/react";
import React from "react";
import { useNavigate } from "react-router";
import { createWorker } from "tesseract.js";

type TransactionType = "income" | "expense";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const getToday = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

//写真からの金額推論機能
const predictReceiptAmount = async (file: File): Promise<number> => {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/receipts/predict`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  } catch (error) {
    console.error("金額予測APIへの接続に失敗しました", error);
    throw new Error("金額予測サービスに接続できませんでした。");
  }

  if (response.status === 401) {
    throw new Error("ログインし直してから、もう一度お試しください。");
  }
  if (response.status === 413) {
    throw new Error("画像は10MB以下にしてください。");
  }
  if (!response.ok) {
    throw new Error(`金額を予測できませんでした（HTTP ${response.status}）。`);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("predicted_yen" in result) ||
    typeof result.predicted_yen !== "number" ||
    !Number.isSafeInteger(result.predicted_yen) ||
    result.predicted_yen < 0
  ) {
    throw new Error("予測サービスから正しい金額を取得できませんでした。");
  }

  return result.predicted_yen;
};

const recognizeReceiptText = async (file: File): Promise<string> => {
  const worker = await createWorker("jpn");
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return text;
  } finally {
    await worker.terminate();
  }
};

const extractReceiptDate = (text: string): string => {
  const match = text.match(
    /(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?/,
  );
  if (!match) return "";

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return "";
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

//追加画面
function InputPage() {
  const {addTransaction, createTransactionData, isLoading} = useAddTransactions();
  const [transactionType, setTransactionType] =
    React.useState<TransactionType>("expense");

  const [item, setItem] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(getToday);

  const [isReadingReceipt, setIsReadingReceipt] = React.useState(false);
  const [receiptError, setReceiptError] = React.useState("");
  const [submitError, setSubmitError] = React.useState("");

  const handleReceiptImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setReceiptError("画像ファイルを選択してください。");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setReceiptError("画像は10MB以下にしてください。");
      return;
    }

    setReceiptError("");
    setIsReadingReceipt(true);

    try {
      const [predictionResult, ocrResult] = await Promise.allSettled([
        predictReceiptAmount(file),
        recognizeReceiptText(file),
      ]);

      const errors: string[] = [];

      if (predictionResult.status === "fulfilled") {
        setAmount(String(predictionResult.value));
        setTransactionType("expense");
        if (!item.trim()) setItem("レシート支出");
      } else {
        console.error("レシート金額の予測に失敗しました", predictionResult.reason);
        errors.push(
          predictionResult.reason instanceof Error
            ? predictionResult.reason.message
            : "金額を予測できませんでした。",
        );
      }

      if (ocrResult.status === "fulfilled") {
        const detectedDate = extractReceiptDate(ocrResult.value);
        if (detectedDate) setDate(detectedDate);
      } else {
        console.error("レシートの日付読み取りに失敗しました", ocrResult.reason);
        errors.push("日付を読み取れませんでした。日付を手入力してください。");
      }

      setReceiptError(errors.join(" "));
    } finally {
      setIsReadingReceipt(false);
    }
  };

  const navigate = useNavigate(); 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!item.trim()) {
      setSubmitError("項目を入力してください。");
      return;
    }

    if (!amount.trim()) {
      setSubmitError("金額を入力してください。");
      return;
    }

    const adjustedAmount = Number(amount);
    if (!Number.isSafeInteger(adjustedAmount) || adjustedAmount < 0) {
      setSubmitError("金額は0以上の整数で入力してください。");
      return;
    }

    const transactionData = createTransactionData(
      transactionType,
      item.trim(),
      adjustedAmount,
      date,
    );

    try {
      await addTransaction(transactionData);
      navigate("/");
    } catch (error) {
      setSubmitError("取引を登録できませんでした。時間をおいて再度お試しください。");
      console.error(error);
    }
  };

  const onCancel = () => {
    navigate("/");
  };

  return (
    <>
      <Header />
      <Container as="main" maxW="2xl" py={{ base: 6, md: 10 }}>
        <Center>
          <VStack width="full" align="stretch" gap={6}>
            <VStack align="start" gap={1}>
              <Heading size="lg">取引を登録</Heading>
              <Text color="gray.600">
                支出や収入を入力してください。レシート画像から金額と日付も読み取れます。
              </Text>
            </VStack>

            <Card.Root variant="elevated">
              <Card.Body>
                <VStack
                  width="full"
                  gap={5}
                  align="stretch"
                  as="form"
                  onSubmit={handleSubmit}
                >
                  <Field.Root>
                    <Field.Label>レシート画像（任意）</Field.Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptImage}
                      disabled={isReadingReceipt || isLoading}
                    />
                    <Field.HelperText>
                      画像を選ぶと金額と日付を自動入力します（10MB以下）。
                    </Field.HelperText>
                  </Field.Root>

                  {isReadingReceipt && (
                    <Text role="status" color="teal.700">
                      金額と日付を読み取り中...
                    </Text>
                  )}

                  {receiptError && (
                    <Text role="alert" color="red.600">
                      {receiptError}
                    </Text>
                  )}

                  <Field.Root>
                    <Field.Label>種類</Field.Label>
                    <RadioGroup.Root
                      value={transactionType}
                      onValueChange={(e) =>
                        setTransactionType(e.value as TransactionType)
                      }
                    >
                      <HStack gap={6}>
                        <RadioGroup.Item value="expense">
                          <RadioGroup.ItemHiddenInput />
                          <RadioGroup.ItemIndicator />
                          <RadioGroup.ItemText>支出</RadioGroup.ItemText>
                        </RadioGroup.Item>
                        <RadioGroup.Item value="income">
                          <RadioGroup.ItemHiddenInput />
                          <RadioGroup.ItemIndicator />
                          <RadioGroup.ItemText>収入</RadioGroup.ItemText>
                        </RadioGroup.Item>
                      </HStack>
                    </RadioGroup.Root>
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>項目</Field.Label>
                    <Input
                      placeholder="例：食費、給料"
                      value={item}
                      maxLength={20}
                      onChange={(e) => setItem(e.target.value)}
                    />
                    <Field.HelperText>20文字以内</Field.HelperText>
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>金額</Field.Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="例：1200"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="0"
                      step="1"
                    />
                    <Field.HelperText>円単位で入力してください。</Field.HelperText>
                  </Field.Root>

                  <Field.Root required>
                    <Field.Label>日付</Field.Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </Field.Root>

                  {submitError && (
                    <Text role="alert" color="red.600">
                      {submitError}
                    </Text>
                  )}

                  <HStack width="full" mt={2} gap={3}>
                    <Button
                      type="button"
                      color="gray.500"
                      variant="outline"
                      flex={1}
                      onClick={onCancel}
                      fontWeight="bold"
                      disabled={isLoading}
                    >
                      キャンセル
                    </Button>
                    <Button
                      type="submit"
                      colorPalette="teal"
                      flex={1}
                      fontWeight="bold"
                      loading={isLoading}
                      disabled={isReadingReceipt}
                    >
                      登録
                    </Button>
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          </VStack>
        </Center>
      </Container>
    </>
  );
}

export default InputPage;
