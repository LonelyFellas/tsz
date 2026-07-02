import { createBrowserRouter } from "react-router-dom";
import { RouteErrorPage } from "@/pages/RouteError";
import { RootProviders } from "./providers";

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
            path: "words/create",
            lazy: async () => ({
              Component: (await import("@/pages/WordCreate")).WordCreatePage
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
