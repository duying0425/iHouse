import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import SearchPage from "@/pages/SearchPage";
import AreaDetailPage from "@/pages/AreaDetailPage";
import ItemFormPage from "@/pages/ItemFormPage";
import ItemDetailPage from "@/pages/ItemDetailPage";
import ExportPage from "@/pages/ExportPage";
import SetupPage from "@/pages/SetupPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/area/:areaId" element={<AreaDetailPage />} />
        <Route path="/area/:areaId/item/new" element={<ItemFormPage />} />
        <Route path="/area/:areaId/item/:itemId" element={<ItemDetailPage />} />
        <Route path="/export" element={<ExportPage />} />
      </Routes>
    </Router>
  );
}
