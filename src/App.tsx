import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import SearchPage from "@/pages/SearchPage";
import AreaDetailPage from "@/pages/AreaDetailPage";
import ItemFormPage from "@/pages/ItemFormPage";
import ItemDetailPage from "@/pages/ItemDetailPage";
import ExportPage from "@/pages/ExportPage";
import SetupPage from "@/pages/SetupPage";
import { useHomeStore } from "@/store";

export default function App() {
  const hasHydrated = useHomeStore((s) => s._hasHydrated);
  const [slow, setSlow] = useState(false);

  // 服务器数据加载超过 1.5s 时显示提示
  useEffect(() => {
    if (hasHydrated) return;
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream text-ink">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-clay-300 border-t-clay-500" />
        <p className="text-2xs text-ink/50">
          {slow ? "正在从服务器加载数据，请稍候…" : "加载中…"}
        </p>
      </div>
    );
  }

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
