import { Spin, Typography } from "antd";
import { createBrowserRouter } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { RouteErrorPage } from "@/pages/RouteError";
import { RootProviders } from "./providers";

// 首屏兜底：路由全部走 route.lazy，首个匹配的 chunk 就绪前 react-router 需要
// HydrateFallback（缺省会告警）。渲染在 RootProviders 之外（无 ConfigProvider，
// antd token 走默认值），视觉与门禁加载态一致，启动时不闪变。
function BootFallback() {
  return (
    <FullscreenCenter>
      <Spin size="small" />
      <Typography.Text type="secondary">加载中...</Typography.Text>
    </FullscreenCenter>
  );
}

// 路由树：RootProviders（Query + 会话恢复）为根 layout，包住登录页与受保护后台壳。
// (console) 分组 → ConsoleLayout 这个 pathless layout route（门禁 + 侧栏 + 顶栏）。
//
// 路由级代码分割：页面与后台壳都走 route.lazy 动态 import，各自成 chunk——
// 登录页不再驮上后台全量代码（词条编辑器、表格等），首屏包显著变小。
// RootProviders 与 RouteErrorPage 保持同步加载：错误兜底页必须在「chunk 加载失败」
// 这种场景下也能渲染，不能自己也依赖异步 chunk。
export const router = createBrowserRouter([
  {
    element: <RootProviders />,
    // 兜底：任一子路由渲染/loader 抛错（含 lazy chunk 加载失败）时渲染此页，
    // 而非 react-router 的空白默认错误页。
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <BootFallback />,
    children: [
      {
        path: "/login",
        lazy: async () => ({
          Component: (await import("@/pages/Login")).LoginPage
        })
      },
      {
        lazy: async () => ({
          Component: (await import("@/layouts/ConsoleLayout")).ConsoleLayout
        }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/pages/Home")).HomePage
            })
          },
          {
            path: "words",
            lazy: async () => ({
              Component: (await import("@/pages/Words")).WordsPage
            })
          },
          {
            // 词条编辑页:创建(POST 得到草稿壳)与编辑存量词条都进这里,按 wordId 加载整棵树。
            path: "words/:wordId/edit",
            lazy: async () => ({
              Component: (await import("@/pages/WordEdit")).WordEditPage
            })
          },
          {
            path: "wordlists",
            lazy: async () => ({
              Component: (await import("@/pages/WordLists")).WordListsPage
            })
          },
          {
            path: "users",
            lazy: async () => ({
              Component: (await import("@/pages/Users")).UsersPage
            })
          },
          {
            path: "admins",
            lazy: async () => ({
              Component: (await import("@/pages/Admins")).AdminsPage
            })
          },
          {
            path: "reviews",
            lazy: async () => ({
              Component: (await import("@/pages/Reviews")).ReviewsPage
            })
          }
        ]
      },
      // 未知路径：显示 404（替代 Next 内置 404），保留错误 URL 而非静默跳回首页，
      // 避免掩盖坏链/拼写错误。
      {
        path: "*",
        lazy: async () => ({
          Component: (await import("@/pages/NotFound")).NotFoundPage
        })
      }
    ]
  }
]);
