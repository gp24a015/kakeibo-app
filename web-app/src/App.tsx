import {Button, Box, Text, Container} from "@chakra-ui/react";

function App(){
  return(
    <>
      <Box
        as="header"
        bg="teal.500"
        color="white"
        py={4}
        textAlign="center"
        boxShadow="md"
      >
        <Text fontSize="xl" fontWeight="bold">
          シンプル家計簿
        </Text>
      </Box>
      <Container as="main" maxW="4xl" py={10}>
        <Button colorPalette="teal" fontWeight="bold">
          登録
        </Button>
      </Container>
    </>
  );
}

export default App;