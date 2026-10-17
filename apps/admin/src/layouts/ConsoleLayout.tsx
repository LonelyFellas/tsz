import { DictionaryFormTypeLabels } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { DictionaryPartOfSpeechLabels } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import MenuOpen from "@mui/icons-material/MenuOpen";
import Menu from "@mui/icons-material/Menu";
import { Box, IconButton, Drawer, Tooltip } from "@mui/material";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AdminHeader } from "@/features/auth/AdminHeader";
import { BusinessPermissionGuard } from "@/features/auth/BusinessPermissionGuard";
import { adminAccountIdentity } from "@/lib/adminAuthorization";
import { useAuthStore } from "@/lib/auth";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";
import { ConsoleSidebar } from "@/features/console/ConsoleSidebar";

// 普通后台沿用既有 md/lg 三档。创建向导的完整导航阈值按可用内容宽度计算：
// 1200 内容区 + 220 完整导航 + 24 * 2 Content 边距 = 1468。
// 未达到该宽度时使用 72px 图标轨，为复杂表单保留舒适编辑空间。
const LG_BREAKPOINT = 992;
const MD_BREAKPOINT = 768;
const WORD_CREATION_FULL_BREAKPOINT = 1200 + 220 + 24 * 2;

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

// 受保护的后台壳：门禁守卫 + MUI 导航壳（侧栏与顶栏），子路由渲染在 <Outlet/>。
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
    else setDrawerOpen(false);
  }, [mode, isDrawer]);

  const toggleLabel = isDrawer
    ? drawerOpen
      ? "关闭菜单"
      : "打开菜单"
    : collapsed
      ? "展开侧栏"
      : "收起侧栏";
  const toggleIcon = (isDrawer ? drawerOpen : !collapsed) ? (
    <MenuOpen />
  ) : (
    <Menu />
  );
  const onToggle = () =>
    isDrawer ? setDrawerOpen((v) => !v) : setCollapsed((v) => !v);

  return (
    <AdminRouteGuard>
      <Box sx={{ minHeight: "100vh", display: "flex" }}>
        {/* 非手机档：in-flow 侧栏（展开/图标轨）。手机档不渲染，内容占满整宽。 */}
        {!isDrawer && (
          <Box
            component="aside"
            sx={{
              width: collapsed ? 72 : 220,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
              position: "sticky",
              top: 0,
              height: "100vh",
              overflow: "auto",
              bgcolor: "background.paper"
            }}
          >
            <ConsoleSidebar collapsed={collapsed} />
          </Box>
        )}

        {/* 手机档：抽屉侧栏，覆盖式展开/收起。 */}
        <Drawer
          anchor="left"
          open={isDrawer && drawerOpen}
          onClose={() => setDrawerOpen(false)}
          slotProps={{ paper: { sx: { width: 220 } } }}
          className="console-mobile-drawer"
        >
          <ConsoleSidebar
            collapsed={false}
            onNavigate={() => setDrawerOpen(false)}
          />
        </Drawer>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            component="header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 64,
              background: "#fff",
              padding: "0 24px 0 8px",
              borderBottom: "1px solid #f0f0f0",
              position: "sticky",
              top: 0,
              zIndex: 10
            }}
          >
            <Tooltip describeChild title={toggleLabel} placement="right">
              <IconButton
                aria-label={toggleLabel}
                onClick={onToggle}
                style={{ width: 40, height: 40, fontSize: 18 }}
              >
                {toggleIcon}
              </IconButton>
            </Tooltip>
            <div style={{ flex: 1 }}>
              <AdminHeader />
            </div>
          </Box>
          <Box component="main" sx={{ p: isDrawer ? 2 : 3 }}>
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
          </Box>
        </Box>
      </Box>
    </AdminRouteGuard>
  );
}
