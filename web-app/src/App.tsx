import {BrowserRouter, Route, Routes} from "react-router";
import Home from "@/pages/Home";
import InputPage from "@/pages/Input";
import DeletePage from "@/pages/Delete";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/input" element={<InputPage />} />
        <Route path="/delete" element={<DeletePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;