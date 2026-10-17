import FactCheck from "@mui/icons-material/FactCheck";
import MenuBook from "@mui/icons-material/MenuBook";
import Paid from "@mui/icons-material/Paid";
import Home from "@mui/icons-material/Home";
import Assignment from "@mui/icons-material/Assignment";
import LibraryBooks from "@mui/icons-material/LibraryBooks";
import EventNote from "@mui/icons-material/EventNote";
import Settings from "@mui/icons-material/Settings";
import Groups from "@mui/icons-material/Groups";
import Person from "@mui/icons-material/Person";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import {
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip
} from "@mui/material";
import type { AdminProfile, MenuPermission } from "@tsz/types";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasAdminPermission, hasAnyAdminPermission } from "@tsz/shared/auth";
import { useAuthStore } from "@/lib/auth";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";

/**
 * 后台侧栏导航（MUI List）。**由后端驱动**：每个叶子挂一个菜单权限 key（RBAC，
 * docs/admin-rbac-design.md），仅当当前管理员持有该 key（super_admin 隐式持有全部）时才渲染
 * ——菜单可见性=后端下发的 profile.permissions。这与「路由是否已落地」正交：已落地叶子挂真实
 * path（key 即路由），点击跳转；未落地的以 `todo:` 前缀标记并渲染为禁用态，避免死链。「首页」
 * 无权限恒显示；「管理员管理」不走 key，仍按 level==super_admin 判定（D9）。当前高亮由
 * useLocation().pathname 推导。
 */
interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: { key: string; label: string; disabled?: boolean }[];
}

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
    icon: <Person />,
    label: "用户管理",
    leaves: [
      pageLeaf(ADMIN_PAGE_ROUTES.users, "用户管理"),
      pageLeaf(ADMIN_PAGE_ROUTES.admins, "管理员管理"),
      pageLeaf(ADMIN_PAGE_ROUTES.permissions, "权限管理")
    ]
  },
  {
    key: "grp-class",
    icon: <Groups />,
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
    icon: <MenuBook />,
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
    key: "grp-wordlist",
    icon: <LibraryBooks />,
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
    icon: <EventNote />,
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
    icon: <FactCheck />,
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
    icon: <Settings />,
    label: "系统设置",
    leaves: [pageLeaf(ADMIN_PAGE_ROUTES.partsOfSpeech, "词性配置")]
  },
  {
    key: "grp-coin",
    icon: <Paid />,
    label: "天生币管理",
    leaves: [pageLeaf(ADMIN_PAGE_ROUTES.coins, "天生币管理")]
  }
];

/**
 * 构造导航树。「首页」恒显示。每个叶子按权限过滤：superOnly 叶子看 isSuperAdmin；其余叶子
 * 当 super_admin 或 permissions 含其 key 时可见（super 隐式全权，即便 permissions 为空也放行）。
 * 分组过滤掉不可见叶子后若为空则整组不渲染。
 */
function buildNav(profile: AdminProfile | null): NavItem[] {
  const visible = (l: Leaf): boolean =>
    l.superOnly
      ? profile?.role === "super_admin"
      : l.anyPermission
        ? hasAnyAdminPermission(profile, l.anyPermission)
        : l.perm !== undefined && hasAdminPermission(profile, l.perm);

  const items: NavItem[] = [{ key: "/", icon: <Home />, label: "首页" }];
  for (const g of GROUPS) {
    const children = g.leaves
      .filter(visible)
      .map((l) => ({ key: l.key, label: l.label, disabled: l.disabled }));
    if (children.length > 0) {
      items.push({ key: g.key, icon: g.icon, label: g.label, children });
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

  const [expanded, setExpanded] = useState<string[]>([]);
  const [popup, setPopup] = useState<{ key: string; anchor: HTMLElement }>();
  const visit = (key: string) => {
    if (key.startsWith("/")) {
      navigate(key);
      setPopup(undefined);
      onNavigate?.();
    }
  };
  const selectedKey = nav
    .flatMap((item) => item.children ?? [item])
    .map((item) => item.key)
    .filter(
      (key) =>
        pathname === key || (key !== "/" && pathname.startsWith(`${key}/`))
    )
    .reduce(
      (selected, key) => (key.length > selected.length ? key : selected),
      ""
    );
  const current = (key: string) => key === selectedKey;
  return (
    <Box
      component="nav"
      aria-label="后台导航"
      sx={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 1,
          p: collapsed ? "18px 0" : "18px 24px",
          fontSize: 18,
          fontWeight: 700,
          color: "primary.main",
          whiteSpace: "nowrap"
        }}
      >
        <Assignment />
        {!collapsed && <span>天生会背</span>}
      </Box>
      <List sx={{ flex: 1 }}>
        {nav.map((item) => (
          <Box key={item.key}>
            <Tooltip
              describeChild
              title={collapsed ? item.label : ""}
              placement="right"
            >
              <ListItemButton
                selected={!item.children && current(item.key)}
                aria-label={item.label}
                aria-expanded={
                  item.children
                    ? collapsed
                      ? popup?.key === item.key
                      : expanded.includes(item.key)
                    : undefined
                }
                onClick={(event) => {
                  if (!item.children) {
                    visit(item.key);
                    return;
                  }
                  if (collapsed)
                    setPopup({ key: item.key, anchor: event.currentTarget });
                  else
                    setExpanded((values) =>
                      values.includes(item.key)
                        ? values.filter((value) => value !== item.key)
                        : [...values, item.key]
                    );
                }}
                sx={{ mx: 1, borderRadius: 1, justifyContent: "center" }}
              >
                <ListItemIcon
                  sx={{ minWidth: collapsed ? 24 : 36, color: "inherit" }}
                >
                  {item.icon}
                </ListItemIcon>
                {!collapsed && (
                  <>
                    <ListItemText primary={item.label} />
                    {item.children &&
                      (expanded.includes(item.key) ? (
                        <ExpandLess />
                      ) : (
                        <ExpandMore />
                      ))}
                  </>
                )}
              </ListItemButton>
            </Tooltip>
            {!collapsed && item.children && (
              <Collapse in={expanded.includes(item.key)} unmountOnExit>
                <List disablePadding>
                  {item.children.map((leaf) => (
                    <ListItemButton
                      key={leaf.key}
                      disabled={leaf.disabled}
                      selected={current(leaf.key)}
                      onClick={() => visit(leaf.key)}
                      sx={{ pl: 6, mx: 1, borderRadius: 1 }}
                    >
                      <ListItemText primary={leaf.label} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            )}
          </Box>
        ))}
      </List>
      <Menu
        anchorEl={popup?.anchor}
        open={!!popup && collapsed}
        onClose={() => setPopup(undefined)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {nav
          .find((item) => item.key === popup?.key)
          ?.children?.map((leaf) => (
            <MenuItem
              key={leaf.key}
              disabled={leaf.disabled}
              selected={current(leaf.key)}
              onClick={() => visit(leaf.key)}
            >
              {leaf.label}
            </MenuItem>
          ))}
      </Menu>
    </Box>
  );
}
