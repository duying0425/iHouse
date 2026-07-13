import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Download,
  Home as HomeIcon,
  LogIn,
  LogOut,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useHomeStore } from "@/store";
import { useAuthStore } from "@/authStore";
import { cn } from "@/lib/utils";

interface TopBarProps {
  /** 当前页标题（左侧显示） */
  title?: string;
  /** 副标题/面包屑 */
  subtitle?: string;
  /** 是否显示三大主功能按钮（默认显示） */
  showActions?: boolean;
  /** 录入按钮跳转目标；不传则弹出区域下拉菜单选择目标区域 */
  addHref?: string;
}

export default function TopBar({
  title,
  subtitle,
  showActions = true,
  addHref,
}: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const areas = useHomeStore((s) => s.areas);
  const homeTitle = useHomeStore((s) => s.title);
  const { user, houses, currentHouseId, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isHome = location.pathname === "/";
  const isDemo = !user; // 演示模式
  const currentHouse = houses.find(
    (h) => h.id === currentHouseId && h.status === "approved"
  );

  const goAdd = (areaId: string) => {
    setMenuOpen(false);
    navigate(`/area/${areaId}/item/new`);
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* 左：品牌 + 房屋名 + 标题 */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className={cn(
              "flex shrink-0 items-center gap-2 text-ink transition-opacity hover:opacity-70",
              isHome && "opacity-100"
            )}
            aria-label="返回首页"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded bg-clay-500 text-cream">
              <HomeIcon size={16} />
            </span>
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-base font-semibold leading-tight text-ink">
              {title || homeTitle || "居所图鉴"}
            </h1>
            {subtitle ? (
              <p className="truncate text-2xs text-ink/50">{subtitle}</p>
            ) : currentHouse ? (
              <button
                onClick={() => navigate("/houses")}
                className="truncate text-2xs text-ink/50 hover:text-clay-500"
                title="切换房屋"
              >
                {currentHouse.name}
                {currentHouse.role === "admin" ? " · 管理员" : ""}
              </button>
            ) : null}
          </div>
        </div>

        {/* 右：功能按钮 + 用户菜单 */}
        <nav className="flex shrink-0 items-center gap-1.5">
          {/* 演示模式：只显示登录按钮 */}
          {isDemo ? (
            <button
              onClick={() => navigate("/login")}
              className="btn-primary"
            >
              <LogIn size={15} />
              <span className="hidden sm:inline">登录</span>
            </button>
          ) : showActions ? (
            <>
              <Link to="/setup" className="btn-ghost" aria-label="户型设置" title="户型设置">
                <Settings size={16} />
                <span className="hidden lg:inline">设置</span>
              </Link>
              <Link to="/search" className="btn-ghost" aria-label="检索">
                <Search size={16} />
                <span className="hidden sm:inline">检索</span>
              </Link>

              {/* 录入：直接目标 or 区域下拉 */}
              {addHref ? (
                <Link to={addHref} className="btn-primary" aria-label="录入">
                  <Plus size={16} />
                  <span className="hidden sm:inline">录入</span>
                </Link>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="btn-primary"
                    aria-label="录入"
                    aria-expanded={menuOpen}
                  >
                    <Plus size={16} />
                    <span className="hidden sm:inline">录入</span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform",
                        menuOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="absolute right-0 z-20 mt-2 w-52 origin-top-right animate-fadeIn overflow-hidden rounded-lg border border-line bg-cream shadow-cardHover">
                        <p className="border-b border-line px-3 py-2 text-2xs uppercase tracking-wider text-ink/45">
                          选择录入到的区域
                        </p>
                        <ul className="max-h-72 overflow-auto py-1">
                          {areas.map((a) => (
                            <li key={a.id}>
                              <button
                                onClick={() => goAdd(a.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-clay-50"
                              >
                                <span className="font-serif">{a.name}</span>
                                <span className="ml-auto text-2xs text-ink/40">
                                  {a.items.length} 件
                                </span>
                              </button>
                            </li>
                          ))}
                          {areas.length === 0 && (
                            <li className="px-3 py-3 text-center text-xs text-ink/40">
                              暂无区域
                            </li>
                          )}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Link to="/export" className="btn-secondary" aria-label="导出">
                <Download size={16} />
                <span className="hidden sm:inline">导出</span>
              </Link>
            </>
          ) : null}

          {/* 用户菜单（已登录才显示） */}
          {!isDemo && (
          <div className="relative ml-1">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-ink hover:bg-clay-50"
              aria-label="用户菜单"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-moss/20 text-moss">
                {(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown
                size={13}
                className={cn(
                  "text-ink/45 transition-transform",
                  userMenuOpen && "rotate-180"
                )}
              />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right animate-fadeIn overflow-hidden rounded-lg border border-line bg-cream shadow-cardHover">
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm text-ink">
                      {user?.displayName || user?.username}
                    </p>
                    {user?.displayName && (
                      <p className="truncate text-2xs text-ink/45">
                        @{user?.username}
                      </p>
                    )}
                  </div>
                  <ul className="py-1">
                    <li>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/houses");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-clay-50"
                      >
                        <HomeIcon size={14} /> 切换房屋
                      </button>
                    </li>
                    {currentHouse && (
                      <li>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate(`/houses/${currentHouse.id}/settings`);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-clay-50"
                        >
                          <Settings size={14} /> 房屋设置
                        </button>
                      </li>
                    )}
                    <li className="border-t border-line">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ochre hover:bg-ochre/10"
                      >
                        <LogOut size={14} /> 退出登录
                      </button>
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
          )}
        </nav>
      </div>
    </header>
  );
}
