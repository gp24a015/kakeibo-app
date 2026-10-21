import {BrowserRouter, Route, Routes} from "react-router";
import Home from "@/pages/Home";
import InputPage from "@/pages/Input";
import DeletePage from "@/pages/Delete";
import AuthPage from "@/pages/Auth";

function App() {
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