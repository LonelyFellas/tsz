import { useAdminTranslation } from "@/i18n";
import type { AdminShellKey } from "@/i18n/resources";
import {
  ClipboardCheckIcon,
  BookIcon,
  CircleDollarSignIcon,
  HouseIcon,
  NotebookTextIcon,
  BookOpenIcon,
  ListChecksIcon,
  CalendarDaysIcon,
  SettingsIcon,
  Volume2Icon,
  UsersIcon,
  UserIcon
} from "lucide-react";
import { Menu, type MenuProps } from "@tsz/ui/admin/overlays";

import type { AdminProfile, MenuPermission } from "@tsz/types";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasAdminPermission, hasAnyAdminPermission } from "@tsz/shared/auth";
import { useAuthStore } from "@/lib/auth";
import {
  ConsoleNavigationPanel,
  type ConsoleNavigationItem
} from "./ConsoleNavigationPanel";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";

/**
 * 后台权限导航。业务叶子挂菜单权限 key（RBAC，
 * docs/admin-rbac-design.md），仅当当前管理员持有该 key（super_admin 隐式持有全部）时才渲染
 * ——菜单可见性=后端下发的 profile.permissions。这与「路由是否已落地」正交：已落地叶子挂真实
 * path（key 即路由），点击跳转；未落地的以 `todo:` 前缀标记并渲染为禁用态，避免死链。「首页」
 * 与「我的天生币」无需业务权限；「管理员管理」不走 key，仍按 level==super_admin 判定（D9）。当前高亮由
 * useLocation().pathname 推导。
 */

/** 一个菜单叶子：perm 为其权限 key；superOnly 的叶子改按 super_admin 判定（不走 key）。 */
interface Leaf {
  key: string;
  label: AdminShellKey;
  perm?: MenuPermission;
  anyPermission?: readonly string[];
  superOnly?: boolean;
  disabled?: boolean;
}

interface Group {
  key: string;
  icon: ReactNode;
  label: AdminShellKey;
  leaves: Leaf[];
}

// 分组与叶子的静态定义（label/icon/path 属前端关注点，不由后端下发）。可见性在 buildNav
// 里按权限过滤：叶子不可见就从分组剔除，分组无可见叶子则整组不渲染。
function pageLeaf(
  route: {
    path: string;
    handle: {
      permission?: MenuPermission;
      anyPermission?: readonly string[];
      superOnly?: boolean;
    };
  },
  label: AdminShellKey
): Leaf {
  return {
    key: `/${route.path}`,
    label,
    perm: route.handle.permission,
    anyPermission: route.handle.anyPermission,
    superOnly: route.handle.superOnly
  };
}

const GROUPS: Group[] = [
  {
    key: "grp-user",
    icon: <UserIcon />,
    label: "nav_users",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.users, "nav_users"),
      pageLeaf(ADMIN_PAGE_ROUTES.admins, "nav_admins"),
      pageLeaf(ADMIN_PAGE_ROUTES.permissions, "nav_permissions")
    ]
  },
  {
    key: "grp-class",
    icon: <UsersIcon />,
    label: "nav_classes",
    leaves: [
      {
        key: "todo:classes",
        label: "nav_classes",
        perm: "classes.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-dict",
    icon: <BookIcon />,
    label: "nav_dictionary",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.words, "nav_words"),
      pageLeaf(ADMIN_PAGE_ROUTES.wordsTrash, "nav_trash"),
      pageLeaf(ADMIN_PAGE_ROUTES.partsOfSpeech, "nav_parts"),
      {
        key: "todo:custom-dict",
        label: "nav_custom_dictionary",
        perm: "customdict.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-voices",
    icon: <Volume2Icon />,
    label: "nav_voice",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.voices, "nav_dubbing"),
      pageLeaf(ADMIN_PAGE_ROUTES.voiceLibrary, "nav_voices")
    ]
  },
  {
    key: "grp-sentences",
    icon: <BookOpenIcon />,
    label: "nav_examples",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.sentences, "nav_sentences"),
      pageLeaf(ADMIN_PAGE_ROUTES.sentencesTrash, "nav_trash")
    ]
  },
  {
    key: "grp-wordlist",
    icon: <ListChecksIcon />,
    label: "nav_wordlists",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.wordlists, "nav_wordlists_entries"),
      pageLeaf(ADMIN_PAGE_ROUTES.reviews, "nav_wordlist_reviews"),
      {
        key: "todo:custom-wordlist",
        label: "nav_custom_wordlists",
        perm: "customwordlist.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-task",
    icon: <CalendarDaysIcon />,
    label: "nav_tasks",
    leaves: [
      {
        key: "todo:tasks",
        label: "nav_tasks",
        perm: "tasks.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-review",
    icon: <ClipboardCheckIcon />,
    label: "nav_reviews",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.teacherApplications, "nav_teacher_reviews"),
      {
        key: "todo:comments",
        label: "nav_comments",
        perm: "comments.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-settings",
    icon: <SettingsIcon />,
    label: "nav_system",
    leaves: [pageLeaf(ADMIN_PAGE_ROUTES.aiLedger, "nav_ai")]
  },
  {
    key: "grp-coin",
    icon: <CircleDollarSignIcon />,
    label: "nav_coins",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.myCoins, "nav_my_coins"),
      pageLeaf(ADMIN_PAGE_ROUTES.coins, "nav_coin_management")
    ]
  }
];

/**
 * 构造导航树。「首页」恒显示。每个叶子按权限过滤：superOnly 叶子看 isSuperAdmin；其余叶子
 * 无权限要求时登录即可见，否则当 super_admin 或 permissions 含其 key 时可见。
 * 分组过滤掉不可见叶子后若为空则整组不渲染。
 */
function buildNav(
  profile: AdminProfile | null,
  t: ReturnType<typeof useAdminTranslation>["t"]
): ConsoleNavigationItem[] {
  const visible = (l: Leaf): boolean =>
    l.superOnly
      ? profile?.role === "super_admin"
      : l.anyPermission
        ? hasAnyAdminPermission(profile, l.anyPermission)
        : l.perm !== undefined
          ? hasAdminPermission(profile, l.perm)
          : profile !== null;

  const items: ConsoleNavigationItem[] = [
    { key: "/", icon: <HouseIcon />, label: t("nav_home") }
  ];
  for (const g of GROUPS) {
    const children = g.leaves
      .filter(visible)
      .map((l) => ({ key: l.key, label: t(l.label), disabled: l.disabled }));
    if (children.length > 0) {
      items.push({ key: g.key, icon: g.icon, label: t(g.label), children });
    }
  }
  return items;
}

export function ConsoleSidebar({
  collapsed = false,
  showBrand = true,
  presentation = "menu",
  onNavigate
}: {
  collapsed?: boolean;
  showBrand?: boolean;
  presentation?: "menu" | "panel";
  // 导航发生后回调（如抽屉态点菜单后关闭抽屉）。
  onNavigate?: () => void;
}) {
  const { t } = useAdminTranslation();
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const nav = useMemo(() => buildNav(profile, t), [profile, t]);

  const onClick: MenuProps["onClick"] = ({ key }) => {
    // 占位项以 todo: 前缀标记（且已 disabled，正常点不到），保险起见再拦一次。
    if (typeof key === "string" && key.startsWith("/")) {
      navigate(key);
      onNavigate?.();
    }
  };

  const selectedKey = nav
    .flatMap((item) =>
      item && "children" in item ? (item.children ?? []) : [item]
    )
    .map((item) => item?.key)
    .filter(
      (key): key is string =>
        typeof key === "string" &&
        (pathname === key || (key !== "/" && pathname.startsWith(`${key}/`)))
    )
    .reduce(
      (selected, key) => (key.length > selected.length ? key : selected),
      ""
    );

  if (presentation === "panel") {
    return (
      <ConsoleNavigationPanel
        items={nav}
        selectedKey={selectedKey}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {showBrand && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 8,
            padding: collapsed ? "18px 0" : "18px 24px",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--ui-color-primary)",
            overflow: "hidden",
            whiteSpace: "nowrap"
          }}
        >
          <NotebookTextIcon style={{ fontSize: 22 }} />
          {/* 收起时仅留图标，隐藏站名，避免文字被裁切成半个字 */}
          {!collapsed && <span>天生会背</span>}
        </div>
      )}
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={[selectedKey]}
        // 配音直链展开所属分组，其他分类仍按需点开。
        defaultOpenKeys={pathname.startsWith("/voices") ? ["grp-voices"] : []}
        onClick={onClick}
        items={nav}
        style={{ borderInlineEnd: 0, flex: 1 }}
      />
    </div>
  );
}
