import {
  Button,  
  Container, 
  Flex,
  Card,
  Heading,
  Grid,
  GridItem,
} from "@chakra-ui/react";
import {FaPlus, FaTrash} from "react-icons/fa";
import {
  RecentIncomeTransactionList,
  RecentExpenseTransactionList,
} from "@/components/TransactionList";
import {Header} from "@/components/Header";
import {useNavigate} from "react-router";

function Home(){
  const navigate = useNavigate();
  return(
    <>
      <Header />
      <Container as="main" maxW="4xl" py={10}>
        <Grid templateColumns="repeat(2, 1fr)" gap={6}>
          <GridItem colSpan={2}>
            <Flex justifyContent="flex-end" gap={3}>
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