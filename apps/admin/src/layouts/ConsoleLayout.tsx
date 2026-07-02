import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Drawer, Layout, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminHeader } from "@/features/auth/AdminHeader";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";
import { ConsoleSidebar } from "@/features/console/ConsoleSidebar";

const { Header, Sider, Content } = Layout;

// 侧栏三档响应式断点（业界通用：Bootstrap / antd 同款）：
// - >= lg 992      大屏：面板展开(220)。
// - md 768 ~ 992   中屏：面板收起为图标轨(72)。
// - < md 768       小屏(手机)：面板脱离布局，改为抽屉(Drawer)覆盖式展开/收起，内容占满整宽。
const LG_BREAKPOINT = 992;
const MD_BREAKPOINT = 768;

type LayoutMode = "full" | "rail" | "drawer";

function modeOf(width: number): LayoutMode {
  if (width < MD_BREAKPOINT) return "drawer";
  if (width < LG_BREAKPOINT) return "rail";
  return "full";
}

// 视口宽度 → 布局模式。用单一 resize 监听驱动三档切换（比 CSS 媒体查询更好协调
// 「in-flow Sider ↔ Drawer」这种结构切换）。SSR 缺省按大屏，客户端挂载即校正。
function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    typeof window === "undefined" ? "full" : modeOf(window.innerWidth)
  );
  useEffect(() => {
    const onResize = () => setMode(modeOf(window.innerWidth));
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mode;
}

// 受保护的后台壳：门禁守卫 + antd Layout（侧栏 Sider + 顶栏 Header），子路由渲染在 <Outlet/>。
// Sider 固定不滚动，仅内容区随主体滚动；整壳撑满视口高度。仅登录的 admin 可见。
export function ConsoleLayout() {
  const mode = useLayoutMode();
  const isDrawer = mode === "drawer";
  // in-flow 面板收展态（full/rail 生效）：随断点自动同步、两次断点之间可手动覆盖。
  const [collapsed, setCollapsed] = useState(mode === "rail");
  // 手机抽屉开合（drawer 生效）。
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 跨断点：非手机档把 in-flow 收展同步到该档默认（大屏展开 / 中屏图标轨）；
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
    <MenuFoldOutlined />
  ) : (
    <MenuUnfoldOutlined />
  );
  const onToggle = () =>
    isDrawer ? setDrawerOpen((v) => !v) : setCollapsed((v) => !v);

  return (
    <AdminRouteGuard>
      <Layout style={{ minHeight: "100vh" }}>
        {/* 非手机档：in-flow 侧栏（展开/图标轨）。手机档不渲染，内容占满整宽。 */}
        {!isDrawer && (
          <Sider
            width={220}
            collapsedWidth={72}
            collapsed={collapsed}
            trigger={null}
            theme="light"
            style={{
              borderInlineEnd: "1px solid #f0f0f0",
              position: "sticky",
              top: 0,
              height: "100vh",
              overflow: "auto"
            }}
          >
            <ConsoleSidebar collapsed={collapsed} />
          </Sider>
        )}

        {/* 手机档：抽屉侧栏，覆盖式展开/收起。 */}
        <Drawer
          placement="left"
          open={isDrawer && drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={220}
          closable={false}
          styles={{ body: { padding: 0 } }}
          rootClassName="console-mobile-drawer"
        >
          <ConsoleSidebar
            collapsed={false}
            onNavigate={() => setDrawerOpen(false)}
          />
        </Drawer>

        <Layout>
          <Header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              padding: "0 24px 0 8px",
              borderBottom: "1px solid #f0f0f0",
              position: "sticky",
              top: 0,
              zIndex: 10
            }}
          >
            <Tooltip title={toggleLabel} placement="right">
              <Button
                type="text"
                aria-label={toggleLabel}
                icon={toggleIcon}
                onClick={onToggle}
                style={{ width: 40, height: 40, fontSize: 18 }}
              />
            </Tooltip>
            <div style={{ flex: 1 }}>
              <AdminHeader />
            </div>
          </Header>
          <Content style={{ padding: isDrawer ? 16 : 24 }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </AdminRouteGuard>
  );
}
