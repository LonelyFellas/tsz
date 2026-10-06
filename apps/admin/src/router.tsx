import { Spin, Typography } from "antd";
import {
  createBrowserRouter,
  redirect,
  type RouteObject
} from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { RouteErrorPage } from "@/pages/RouteError";
import { RootProviders } from "./providers";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";

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

/** Shared by browser routing and MemoryRouter contract tests. */
export const wordRoutes: RouteObject[] = [
  {
    ...ADMIN_PAGE_ROUTES.words,
    lazy: async () => ({
      Component: (await import("@/pages/Words")).WordsPage
    })
  },
  {
    ...ADMIN_PAGE_ROUTES.wordsTrash,
    lazy: async () => ({
      Component: (await import("@/pages/WordsTrash")).WordsTrashPage
    })
  },
  {
    ...ADMIN_PAGE_ROUTES.wordsNewV3,
    loader: () => redirect("/words/new")
  },
  {
    ...ADMIN_PAGE_ROUTES.wordsNew,
    lazy: async () => ({
      Component: (await import("@/pages/WordCreate")).WordCreatePage
    })
  },
  {
    ...ADMIN_PAGE_ROUTES.wordWizard,
    lazy: async () => ({
      Component: (await import("@/pages/WordWizardV3")).WordWizardV3Page
    })
  }
];

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
        // 顶层路由（不进 (console) 门禁壳）：强制改密态 profile 为空、其余接口皆 403，
        // 唯有独立可达的改密页能让被重置的管理员完成改密。
        path: "/change-password",
        lazy: async () => ({
          Component: (await import("@/pages/ChangePassword")).ChangePasswordPage
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
          ...wordRoutes,
          {
            ...ADMIN_PAGE_ROUTES.coins,
            lazy: async () => ({
              Component: (await import("@/pages/Coins")).CoinsPage
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.myCoins,
            lazy: async () => ({
              Component: (await import("@/pages/MyCoins")).MyCoinsPage
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.sentences,
            lazy: async () => ({
              Component: (await import("@/pages/Sentences")).SentencesPage
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.users,
            lazy: async () => ({
              Component: (await import("@/pages/Users")).UsersPage
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.teacherApplications,
            lazy: async () => ({
              Component: (
                await import("@/features/teacher-certification/TeacherApplications")
              ).TeacherApplicationsPage
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.permissions,
            lazy: async () => ({
              Component: (
                await import("@/features/permissions/PermissionManagement")
              ).PermissionManagement
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.admins,
            lazy: async () => ({
              Component: (await import("@/pages/Admins")).AdminsPage
            })
          },
          // wordlists / reviews / roles 三条路由都待后端与页面落地：占位页与请求层
          // 留在 pages/ 与 features/ 下不动，做好之后把路由接回来即可。
          // roles 路由随 RBAC 后端一起待定：页面与请求层留在 pages/Roles.tsx、
          // features/roles 下不动，后端就绪后把这段接回来即可。
          {
            // 个人设置：入口在顶栏头像菜单，不进侧栏（侧栏由后端菜单权限驱动）。
            ...ADMIN_PAGE_ROUTES.profileSettings,
            lazy: async () => ({
              Component: (await import("@/pages/ProfileSettings"))
                .ProfileSettingsPage
            })
          },
          {
            ...ADMIN_PAGE_ROUTES.partsOfSpeech,
            lazy: async () => ({
              Component: (await import("@/pages/PartOfSpeechSettings"))
                .PartOfSpeechSettingsPage
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
