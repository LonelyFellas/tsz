import { createBrowserRouter } from "react-router-dom";
import { ConsoleLayout } from "@/layouts/ConsoleLayout";
import { HomePage } from "@/pages/Home";
import { LoginPage } from "@/pages/Login";
import { NotFoundPage } from "@/pages/NotFound";
import { ReviewsPage } from "@/pages/Reviews";
import { RouteErrorPage } from "@/pages/RouteError";
import { UsersPage } from "@/pages/Users";
import { WordListsPage } from "@/pages/WordLists";
import { WordsPage } from "@/pages/Words";
import { RootProviders } from "./providers";

// 路由树：RootProviders（Query + 会话恢复）为根 layout，包住登录页与受保护后台壳。
// (console) 分组 → ConsoleLayout 这个 pathless layout route（门禁 + 侧栏 + 顶栏）。
export const router = createBrowserRouter([
  {
    element: <RootProviders />,
    // 兜底：任一子路由渲染/loader 抛错时渲染此页，而非 react-router 的空白默认错误页。
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <ConsoleLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "words", element: <WordsPage /> },
          { path: "wordlists", element: <WordListsPage /> },
          { path: "users", element: <UsersPage /> },
          { path: "reviews", element: <ReviewsPage /> }
        ]
      },
      // 未知路径：显示 404（替代 Next 内置 404），保留错误 URL 而非静默跳回首页，
      // 避免掩盖坏链/拼写错误。
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);
