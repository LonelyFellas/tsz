import { DictionaryFormTypeLabels } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { DictionaryPartOfSpeechLabels } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { XIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AdminHeader } from "@/features/auth/AdminHeader";
import { BusinessPermissionGuard } from "@/features/auth/BusinessPermissionGuard";
import { adminAccountIdentity } from "@/lib/adminAuthorization";
import { useAuthStore } from "@/lib/auth";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";
import { ConsoleSidebar } from "@/features/console/ConsoleSidebar";

import "./console-shell.css";

// 普通后台沿用 antd 的 md/lg 三档。创建向导的完整导航阈值按可用内容宽度计算：
// 1200 内容区 + 220 完整导航 + 24 * 2 Content 边距 = 1468。
// 未达到该宽度时使用 72px 图标轨，为复杂表单保留舒适编辑空间。
const LG_BREAKPOINT = 992;
const MD_BREAKPOINT = 768;
const WORD_CREATION_FULL_BREAKPOINT = 1200 + 220 + 24 * 2;

// 顶栏层级必须高于表格内固定列的层叠：antd v6 的 Table 固定单元格是
// `calc(var(--z-offset-reverse) + zIndexTableFixed)`（默认 2 + 固定列偏移，实测 10~12），
// 与顶栏同值时后渲染的表体会反盖住顶栏。弹层（Drawer/Modal）仍在 1000+。
export const CONSOLE_HEADER_Z_INDEX = 100;

type LayoutMode = "full" | "rail" | "drawer";

export function isWordCreationWorkspacePath(pathname: string): boolean {
  return (
    pathname === "/words/new" ||
    /^\/words\/[^/]+\/(?:v3\/)?wizard\/(basics|forms|meanings|preview)$/.test(
      pathname
    )
  );
}

export function modeOf(
  width: number,
  isWordCreationWorkspace = false
): LayoutMode {
  if (width < MD_BREAKPOINT) return "drawer";
  const fullBreakpoint = isWordCreationWorkspace
    ? WORD_CREATION_FULL_BREAKPOINT
    : LG_BREAKPOINT;
  if (width < fullBreakpoint) return "rail";
  return "full";
}

// 视口宽度 → 布局模式。用单一 resize 监听驱动三档切换（比 CSS 媒体查询更好协调
// 「in-flow Sider ↔ Drawer」这种结构切换）。SSR 缺省按大屏，客户端挂载即校正。
function useLayoutMode(isWordCreationWorkspace: boolean): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    typeof window === "undefined"
      ? "full"
      : modeOf(window.innerWidth, isWordCreationWorkspace)
  );
  useEffect(() => {
    const onResize = () =>
      setMode(modeOf(window.innerWidth, isWordCreationWorkspace));
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [isWordCreationWorkspace]);
  return mode;
}

// 全局导航与业务路由共享同一个受保护外壳。
// Sider 固定不滚动，仅内容区随主体滚动；整壳撑满视口高度。仅登录的 admin 可见。
export function ConsoleLayout() {
  const identity = useAuthStore((s) => adminAccountIdentity(s.profile));
  const { pathname } = useLocation();
  const isWordCreationWorkspace = isWordCreationWorkspacePath(pathname);
  const mode = useLayoutMode(isWordCreationWorkspace);
  const isDrawer = mode === "drawer";
  // in-flow 面板收展态（full/rail 生效）：随断点自动同步、两次断点之间可手动覆盖。
  const [collapsed, setCollapsed] = useState(mode === "rail");
  // 手机抽屉开合（drawer 生效）。
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 跨断点时同步默认收展；同一断点内 resize 不覆盖用户手动选择。
  // 进入手机档不再关心 collapsed，离开手机档则关掉抽屉遮罩。
  useEffect(() => {
    if (!isDrawer) setCollapsed(mode === "rail");
    setDrawerOpen(false);
  }, [mode, isDrawer]);

  const toggleLabel = isDrawer
    ? drawerOpen
      ? "关闭菜单"
      : "打开菜单"
    : collapsed
      ? "展开侧栏"
      : "收起侧栏";
  const toggleIcon = (isDrawer ? drawerOpen : !collapsed) ? (
    <PanelLeftCloseIcon />
  ) : (
    <PanelLeftOpenIcon />
  );
  const toggle = (
    <button
      type="button"
      className="console-nav-button"
      title={toggleLabel}
      aria-label={toggleLabel}
      aria-expanded={isDrawer ? drawerOpen : !collapsed}
      onClick={isDrawer ? undefined : () => setCollapsed((value) => !value)}
    >
      {toggleIcon}
    </button>
  );

  return (
    <AdminRouteGuard>
      <Dialog.Root open={isDrawer && drawerOpen} onOpenChange={setDrawerOpen}>
        <div className="console-shell">
          {!isDrawer && (
            <aside className="console-sidebar" data-collapsed={collapsed}>
              <ConsoleSidebar collapsed={collapsed} />
            </aside>
          )}
          <div className="console-workspace">
            <header
              className="console-topbar"
              style={{ zIndex: CONSOLE_HEADER_Z_INDEX }}
            >
              {isDrawer ? (
                <Dialog.Trigger asChild>{toggle}</Dialog.Trigger>
              ) : (
                toggle
              )}
              <AdminHeader />
            </header>
            <main className="console-content">
              <BusinessPermissionGuard key={identity}>
                {pathname.startsWith("/words") ? (
                  <DictionaryFormTypeLabels>
                    <DictionaryPartOfSpeechLabels>
                      <Outlet />
                    </DictionaryPartOfSpeechLabels>
                  </DictionaryFormTypeLabels>
                ) : (
                  <Outlet />
                )}
              </BusinessPermissionGuard>
            </main>
          </div>
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="console-nav-backdrop" />
          <Dialog.Content
            className="console-nav-sheet"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">后台导航</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="console-nav-button console-nav-close"
                aria-label="关闭菜单"
              >
                <XIcon />
              </button>
            </Dialog.Close>
            <ConsoleSidebar onNavigate={() => setDrawerOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AdminRouteGuard>
  );
}
