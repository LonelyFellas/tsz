"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 后台侧栏导航框架（与截图一致的分组结构）。
 *
 * 仅「首页」已落地真实路由，其余为后续模块占位：有 href 的渲染为可跳转 Link，
 * 无 href 的渲染为禁用态条目，避免在路由未建好前产生死链。各模块上线时
 * 把对应 href 补上即可点亮。
 */
interface NavLeaf {
  label: string;
  href?: string;
}

interface NavGroup {
  label: string;
  children: NavLeaf[];
}

// 单条目（如「首页」）用没有 children 的组表达，children 为空时整组即为叶子。
const NAV: NavGroup[] = [
  { label: "首页", children: [{ label: "首页", href: "/" }] },
  {
    label: "用户管理",
    children: [{ label: "教师管理" }, { label: "学生管理" }]
  },
  { label: "班级管理", children: [{ label: "班级管理" }] },
  {
    label: "词库管理",
    children: [
      { label: "智能词库" },
      { label: "自定义词库" },
      { label: "多维例句" }
    ]
  },
  {
    label: "词表管理",
    children: [{ label: "智能词表" }, { label: "自定义词表" }]
  },
  { label: "任务管理", children: [{ label: "任务管理" }] },
  {
    label: "审核管理",
    children: [
      { label: "词表审核" },
      { label: "教师申请审核" },
      { label: "评论审核" }
    ]
  },
  { label: "天生币管理", children: [] }
];

function NavItem({ leaf, active }: { leaf: NavLeaf; active: boolean }) {
  const base = "block rounded-md px-3 py-2 text-sm transition-colors";

  if (!leaf.href) {
    return (
      <span className={`${base} cursor-not-allowed text-gray-300`}>
        {leaf.label}
      </span>
    );
  }

  return (
    <Link
      href={leaf.href}
      className={`${base} ${
        active
          ? "bg-blue-50 font-medium text-blue-600"
          : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      {leaf.label}
    </Link>
  );
}

export function ConsoleSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen w-56 shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="flex items-center gap-2 px-6 py-5">
        <span aria-hidden className="text-2xl">
          📖
        </span>
        <span className="text-lg font-bold text-blue-600">天生会背</span>
      </div>
      <nav className="flex flex-col gap-1 px-3 pb-6">
        {NAV.map((group) => {
          // 单条目分组（首页）：组名本身就是可跳转项。
          const [only] = group.children;
          if (group.children.length === 1 && only?.href) {
            return (
              <NavItem
                key={group.label}
                leaf={only}
                active={pathname === only.href}
              />
            );
          }

          return (
            <div key={group.label} className="mt-2">
              <p className="px-3 py-1.5 text-xs font-medium text-gray-400">
                {group.label}
              </p>
              {group.children.map((leaf) => (
                <NavItem
                  key={leaf.label}
                  leaf={leaf}
                  active={!!leaf.href && pathname === leaf.href}
                />
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
