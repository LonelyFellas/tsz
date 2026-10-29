import {
  AuditOutlined,
  BookOutlined,
  DollarOutlined,
  HomeOutlined,
  ProfileOutlined,
  QuestionCircleOutlined,
  ReadOutlined,
  ScheduleOutlined,
  SettingOutlined,
  SoundOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { Menu } from "antd";
import type { MenuProps } from "antd";
import type { AdminProfile, MenuPermission } from "@tsz/types";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasAdminPermission, hasAnyAdminPermission } from "@tsz/shared/auth";
import { useAuthStore } from "@/lib/auth";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";

/**
 * 后台侧栏导航（antd Menu）。业务叶子挂菜单权限 key（RBAC，
 * docs/admin-rbac-design.md），仅当当前管理员持有该 key（super_admin 隐式持有全部）时才渲染
 * ——菜单可见性=后端下发的 profile.permissions。这与「路由是否已落地」正交：已落地叶子挂真实
 * path（key 即路由），点击跳转；未落地的以 `todo:` 前缀标记并渲染为禁用态，避免死链。「首页」
 * 与「我的天生币」无需业务权限；「管理员管理」不走 key，仍按 level==super_admin 判定（D9）。当前高亮由
 * useLocation().pathname 推导。
 */
type MenuItem = Required<MenuProps>["items"][number];

/** 一个菜单叶子：perm 为其权限 key；superOnly 的叶子改按 super_admin 判定（不走 key）。 */
interface Leaf {
  key: string;
  label: string;
  perm?: MenuPermission;
  anyPermission?: readonly string[];
  superOnly?: boolean;
  disabled?: boolean;
}

interface Group {
  key: string;
  icon: ReactNode;
  label: string;
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
  label: string
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
    icon: <UserOutlined />,
    label: "用户管理",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.users, "用户管理"),
      pageLeaf(ADMIN_PAGE_ROUTES.admins, "管理员管理"),
      pageLeaf(ADMIN_PAGE_ROUTES.permissions, "权限管理")
    ]
  },
  {
    key: "grp-class",
    icon: <TeamOutlined />,
    label: "班级管理",
    leaves: [
      {
        key: "todo:classes",
        label: "班级管理",
        perm: "classes.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-dict",
    icon: <BookOutlined />,
    label: "词库管理",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.words, "智能词库"),
      pageLeaf(ADMIN_PAGE_ROUTES.wordsTrash, "垃圾桶"),
      {
        key: "todo:custom-dict",
        label: "自定义词库",
        perm: "customdict.access",
        disabled: true
      },
      pageLeaf(ADMIN_PAGE_ROUTES.sentences, "多维例句")
    ]
  },
  {
    key: "grp-questions",
    icon: <QuestionCircleOutlined />,
    label: "题型管理",
    leaves: [pageLeaf(ADMIN_PAGE_ROUTES.questionBank, "单选题工作台")]
  },
  {
    key: "grp-wordlist",
    icon: <ReadOutlined />,
    label: "词表管理",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.wordlists, "智能词表"),
      {
        key: "todo:custom-wordlist",
        label: "自定义词表",
        perm: "customwordlist.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-task",
    icon: <ScheduleOutlined />,
    label: "任务管理",
    leaves: [
      {
        key: "todo:tasks",
        label: "任务管理",
        perm: "tasks.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-review",
    icon: <AuditOutlined />,
    label: "审核管理",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.reviews, "词表审核"),
      pageLeaf(ADMIN_PAGE_ROUTES.teacherApplications, "教师申请审核"),
      {
        key: "todo:comments",
        label: "评论审核",
        perm: "comments.access",
        disabled: true
      }
    ]
  },
  {
    key: "grp-settings",
    icon: <SettingOutlined />,
    label: "系统设置",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.partsOfSpeech, "词性配置"),
      pageLeaf(ADMIN_PAGE_ROUTES.aiLedger, "AI 账本")
    ]
  },
  {
    key: "grp-coin",
    icon: <DollarOutlined />,
    label: "天生币",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.myCoins, "我的天生币"),
      pageLeaf(ADMIN_PAGE_ROUTES.coins, "天生币管理")
    ]
  }
];

/**
 * 构造导航树。「首页」恒显示。每个叶子按权限过滤：superOnly 叶子看 isSuperAdmin；其余叶子
 * 无权限要求时登录即可见，否则当 super_admin 或 permissions 含其 key 时可见。
 * 分组过滤掉不可见叶子后若为空则整组不渲染。
 */
function buildNav(profile: AdminProfile | null): MenuItem[] {
  const visible = (l: Leaf): boolean =>
    l.superOnly
      ? profile?.role === "super_admin"
      : l.anyPermission
        ? hasAnyAdminPermission(profile, l.anyPermission)
        : l.perm !== undefined
          ? hasAdminPermission(profile, l.perm)
          : profile !== null;

  const items: MenuItem[] = [
    { key: "/", icon: <HomeOutlined />, label: "首页" }
  ];
  for (const g of GROUPS) {
    const children = g.leaves
      .filter(visible)
      .map((l) => ({ key: l.key, label: l.label, disabled: l.disabled }));
    if (children.length > 0) {
      items.push({ key: g.key, icon: g.icon, label: g.label, children });
    }
    if (
      g.key === "grp-dict" &&
      visible(pageLeaf(ADMIN_PAGE_ROUTES.voices, "配音中心"))
    ) {
      items.push({
        key: `/${ADMIN_PAGE_ROUTES.voices.path}`,
        icon: <SoundOutlined />,
        label: "配音中心"
      });
    }
  }
  return items;
}

export function ConsoleSidebar({
  collapsed = false,
  onNavigate
}: {
  collapsed?: boolean;
  // 导航发生后回调（如抽屉态点菜单后关闭抽屉）。
  onNavigate?: () => void;
}) {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const nav = useMemo(() => buildNav(profile), [profile]);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 8,
          padding: collapsed ? "18px 0" : "18px 24px",
          fontSize: 18,
          fontWeight: 700,
          color: "#2053FF",
          overflow: "hidden",
          whiteSpace: "nowrap"
        }}
      >
        <ProfileOutlined style={{ fontSize: 22 }} />
        {/* 收起时仅留图标，隐藏站名，避免文字被裁切成半个字 */}
        {!collapsed && <span>天生会背</span>}
      </div>
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={[selectedKey]}
        // 分类分组默认收起（不设 defaultOpenKeys）：初始只见顶层分类，按需点开。
        // 收起态下 antd 改用悬浮弹层展示子菜单，不受此影响。
        onClick={onClick}
        items={nav}
        style={{ borderInlineEnd: 0, flex: 1 }}
      />
    </div>
  );
}
