import {
  AuditOutlined,
  BookOutlined,
  DollarOutlined,
  HomeOutlined,
  ProfileOutlined,
  ReadOutlined,
  ScheduleOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { Menu } from "antd";
import type { MenuProps } from "antd";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/auth";

/**
 * 后台侧栏导航（antd Menu）。
 *
 * 已落地真实路由的叶子挂 path（key 即路由），点击跳转；未落地的模块 key 以 `todo:`
 * 前缀标记，渲染为禁用态，避免路由未建好前产生死链——各模块上线时把 key 换成真实
 * path 即可点亮。当前高亮由 useLocation().pathname 推导。
 */
type MenuItem = Required<MenuProps>["items"][number];

/**
 * 构造导航树。「用户管理」分组下两个 section：用户管理（C 端用户，所有 admin 可见）、
 * 管理员管理（后台管理员，**仅 super_admin 可见**——非超管时不渲染该叶子）。
 */
function buildNav(isSuperAdmin: boolean): MenuItem[] {
  const userChildren: MenuItem[] = [{ key: "/users", label: "用户管理" }];
  if (isSuperAdmin) {
    userChildren.push({ key: "/admins", label: "管理员管理" });
  }
  return [
    { key: "/", icon: <HomeOutlined />, label: "首页" },
    {
      key: "grp-user",
      icon: <UserOutlined />,
      label: "用户管理",
      children: userChildren
    },
    {
      key: "grp-class",
      icon: <TeamOutlined />,
      label: "班级管理",
      children: [{ key: "todo:classes", label: "班级管理", disabled: true }]
    },
    {
      key: "grp-dict",
      icon: <BookOutlined />,
      label: "词库管理",
      children: [
        { key: "/words", label: "智能词库" },
        { key: "todo:custom-dict", label: "自定义词库", disabled: true },
        { key: "todo:sentences", label: "多维例句", disabled: true }
      ]
    },
    {
      key: "grp-wordlist",
      icon: <ReadOutlined />,
      label: "词表管理",
      children: [
        { key: "/wordlists", label: "智能词表" },
        { key: "todo:custom-wordlist", label: "自定义词表", disabled: true }
      ]
    },
    {
      key: "grp-task",
      icon: <ScheduleOutlined />,
      label: "任务管理",
      children: [{ key: "todo:tasks", label: "任务管理", disabled: true }]
    },
    {
      key: "grp-review",
      icon: <AuditOutlined />,
      label: "审核管理",
      children: [
        { key: "/reviews", label: "词表审核" },
        { key: "todo:teacher-apply", label: "教师申请审核", disabled: true },
        { key: "todo:comments", label: "评论审核", disabled: true }
      ]
    },
    {
      key: "grp-coin",
      icon: <DollarOutlined />,
      label: "天生币管理",
      children: [{ key: "todo:coins", label: "天生币管理", disabled: true }]
    }
  ];
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
  const isSuperAdmin = useAuthStore((s) => s.profile?.level === "super_admin");
  const nav = useMemo(() => buildNav(isSuperAdmin), [isSuperAdmin]);

  const onClick: MenuProps["onClick"] = ({ key }) => {
    // 占位项以 todo: 前缀标记（且已 disabled，正常点不到），保险起见再拦一次。
    if (typeof key === "string" && key.startsWith("/")) {
      navigate(key);
      onNavigate?.();
    }
  };

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
          color: "#0071e3",
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
        selectedKeys={[pathname]}
        // 分类分组默认收起（不设 defaultOpenKeys）：初始只见顶层分类，按需点开。
        // 收起态下 antd 改用悬浮弹层展示子菜单，不受此影响。
        onClick={onClick}
        items={nav}
        style={{ borderInlineEnd: 0, flex: 1 }}
      />
    </div>
  );
}
