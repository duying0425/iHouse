import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { LogIn, X } from "lucide-react";
import HomePage from "@/pages/HomePage";
import SearchPage from "@/pages/SearchPage";
import AreaDetailPage from "@/pages/AreaDetailPage";
import ItemFormPage from "@/pages/ItemFormPage";
import ItemDetailPage from "@/pages/ItemDetailPage";
import ExportPage from "@/pages/ExportPage";
import SetupPage from "@/pages/SetupPage";
import LoginPage from "@/pages/LoginPage";
import HousesPage from "@/pages/HousesPage";
import HouseSettingsPage from "@/pages/HouseSettingsPage";
import { useHomeStore } from "@/store";
import { useAuthStore } from "@/authStore";

export default function App() {
  const hasHydrated = useHomeStore((s) => s._hasHydrated);
  const [slow, setSlow] = useState(false);

  const authInitialized = useAuthStore((s) => s.initialized);
  const user = useAuthStore((s) => s.user);
  const currentHouseId = useAuthStore((s) => s.currentHouseId);
  const loadMe = useAuthStore((s) => s.loadMe);
  const reloadCurrentHouse = useHomeStore((s) => s.reloadCurrentHouse);

  // 启动时拉取用户信息
  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  // 切换房屋时重新加载 store 数据
  const lastLoadedHouse = useRef<string | null>(null);
  useEffect(() => {
    if (!authInitialized || !user) return;
    if (!currentHouseId) {
      lastLoadedHouse.current = null;
      return;
    }
    if (lastLoadedHouse.current === currentHouseId) return;
    lastLoadedHouse.current = currentHouseId;
    void reloadCurrentHouse();
  }, [authInitialized, user, currentHouseId, reloadCurrentHouse]);

  // 服务器数据加载超过 1.5s 时显示提示
  useEffect(() => {
    if (hasHydrated) return;
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
  }, [hasHydrated]);

  // 1. 账户未初始化 → 加载中
  if (!authInitialized) {
    return <LoadingScreen slow={false} />;
  }

  // 2. 未登录 → 演示模式：允许游览完整应用，顶部提示条
  if (!user) {
    return (
      <Router>
        <DemoBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/area/:areaId" element={<AreaDetailPage />} />
          <Route path="/area/:areaId/item/new" element={<ItemFormPage />} />
          <Route path="/area/:areaId/item/:itemId" element={<ItemDetailPage />} />
          <Route path="/export" element={<ExportPage />} />
          {/* 未登录访问房屋相关页直接跳登录 */}
          <Route path="/houses" element={<Navigate to="/login" replace />} />
          <Route path="/houses/:id/settings" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    );
  }

  // 3. 已登录但未选房屋：只能访问 /houses* 路由
  if (!currentHouseId) {
    return (
      <Router>
        <Routes>
          <Route path="/houses" element={<HousesPage />} />
          <Route path="/houses/:id/settings" element={<HouseSettingsPage />} />
          <Route path="/login" element={<Navigate to="/houses" replace />} />
          <Route path="*" element={<Navigate to="/houses" replace />} />
        </Routes>
      </Router>
    );
  }

  // 4. 已登录 + 已选房屋，但 home 数据未水合完成
  if (!hasHydrated) {
    return <LoadingScreen slow={slow} />;
  }

  // 5. 正常渲染：所有业务路由
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
        <Route path="/houses" element={<HousesPage />} />
        <Route path="/houses/:id/settings" element={<HouseSettingsPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

/** 未登录演示模式顶部提示条 */
function DemoBanner() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) {
    // 关闭后右下角保留一个浮动的「登录」入口
    return (
      <button
        onClick={() => navigate("/login")}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full bg-clay-500 px-4 py-2 text-2xs text-cream shadow-cardHover hover:bg-clay-600"
      >
        <LogIn size={13} /> 登录
      </button>
    );
  }
  return (
    <div className="sticky top-0 z-40 flex h-9 items-center justify-between gap-2 bg-clay-500 px-4 text-cream">
      <p className="truncate text-2xs">
        演示模式 · 当前为示例数据，登录后可保存你自己的房屋数据
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => navigate("/login")}
          className="rounded bg-cream px-2.5 py-1 text-2xs font-medium text-clay-600 hover:bg-cream/90"
        >
          去登录
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded p-0.5 hover:bg-clay-600"
          aria-label="关闭"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function LoadingScreen({ slow }: { slow: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream text-ink">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-clay-300 border-t-clay-500" />
      <p className="text-2xs text-ink/50">
        {slow ? "正在从服务器加载数据，请稍候…" : "加载中…"}
      </p>
    </div>
  );
}
