"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Globe,
  Home,
  LayoutGrid,
  Settings,
  UserRound,
  Users,
  Wallet,
  X
} from "lucide-react";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger
} from "@tsz/ui/components";
import { useUserStore } from "@/stores/user";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { AccountMenu } from "@/features/home/components/AccountMenu";
import { BrandMark } from "@/features/home/components/BrandMark";
import { ThemeModeControl } from "@/features/theme/ThemeModeControl";
import { LearningPreferences } from "@/features/student-home/LearningPreferences";

type NavItem = { href: string; label: string; icon: LucideIcon };

const STUDENT_NAV: NavItem[][] = [
  [
    { href: "/account/wordlists", label: "我的词表", icon: BookOpen },
    { href: "/student/practice", label: "我的任务", icon: ClipboardList },
    { href: "/wordlists", label: "词库广场", icon: Globe }
  ],
  [
    { href: "/student/home", label: "学习首页", icon: LayoutGrid },
    { href: "/account/coins", label: "天生币", icon: Wallet },
    { href: "/account/notifications", label: "通知", icon: Bell },
    { href: "/account/profile", label: "个人资料", icon: UserRound }
  ]
];

const TEACHER_NAV: NavItem[][] = [
  [
    { href: "/teacher/classes", label: "我的班级", icon: Users },
    { href: "/teacher/tasks", label: "教学任务", icon: ClipboardList },
    { href: "/teacher/stats", label: "学习数据", icon: BarChart3 }
  ],
  [
    { href: "/account/wordlists", label: "我的词表", icon: BookOpen },
    { href: "/wordlists", label: "词库广场", icon: Globe },
    { href: "/account/notifications", label: "通知", icon: Bell },
    { href: "/account/profile", label: "个人资料", icon: UserRound }
  ]
];

// 已登录但既非学生、也不在教学工作台：只保留与学习身份无关的入口。
const ACCOUNT_NAV: NavItem[][] = [
  [
    { href: "/account/wordlists", label: "我的词表", icon: BookOpen },
    { href: "/wordlists", label: "词库广场", icon: Globe }
  ],
  [
    { href: "/account/coins", label: "天生币", icon: Wallet },
    { href: "/account/notifications", label: "通知", icon: Bell },
    { href: "/account/profile", label: "个人资料", icon: UserRound }
  ]
];

const GUEST_NAV: NavItem[][] = [
  [{ href: "/wordlists", label: "词库广场", icon: Globe }]
];

const PANEL_CLASS =
  "tsz-drawer w-[330px] rounded-3xl border-border/60 bg-surface/90 p-5 shadow-float backdrop-blur-xl";

function PanelHeading({ title }: { title: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <PopoverClose
        aria-label={`关闭${title}`}
        className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X className="size-[18px]" strokeWidth={1.5} aria-hidden />
      </PopoverClose>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// 学习区与主区共用顶栏：左侧品牌菜单、右侧设置，均从各自一侧弹出浮层。
export function AppTopbar() {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  return <TopbarPanels key={user?.id ?? "guest"} hydrated={hydrated} />;
}

function TopbarPanels({ hydrated }: { hydrated: boolean }) {
  const user = useUserStore((s) => s.user);
  const identity = useTeacherIdentity();
  const pathname = usePathname() ?? "";
  const [panel, setPanel] = useState<"navigation" | "settings" | null>(null);

  // /teacher/* 上不看工作台偏好：核验返回前内容已由 TeacherAccessGuard 拦住，核验通过后
  // 偏好要等 Provider 的 effect 才改写为 teacher，两段都按教学工作台展示，避免闪出学习菜单。
  const teaching =
    !!user &&
    (pathname.startsWith("/teacher/")
      ? !identity.ready || identity.verified
      : identity.ready && identity.verified && identity.identity === "teacher");
  const studying = !!user && !teaching && user.roles.includes("student");
  const groups = !user
    ? GUEST_NAV
    : teaching
      ? TEACHER_NAV
      : studying
        ? STUDENT_NAV
        : ACCOUNT_NAV;
  const menuTitle = teaching ? "教学菜单" : studying ? "学习菜单" : "网站菜单";
  const settingsTitle = studying ? "学习设置" : "设置";

  function toggle(name: "navigation" | "settings", open: boolean) {
    setPanel((current) => (open ? name : current === name ? null : current));
  }

  return (
    <header className="sticky top-0 z-50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-3 sm:px-5">
        <Popover
          open={panel === "navigation"}
          onOpenChange={(open) => toggle("navigation", open)}
        >
          <PopoverTrigger
            aria-label={menuTitle}
            className="group inline-flex h-11 items-center gap-2.5 rounded-full px-3 text-base font-bold tracking-tight text-foreground transition-colors hover:bg-surface/80 focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-surface data-[state=open]:shadow-glass"
          >
            <BrandMark />
            天生会背
            <ChevronDown
              className="size-4 text-foreground-muted transition-transform duration-200 group-data-[state=open]:rotate-180"
              strokeWidth={1.8}
              aria-hidden
            />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            aria-label={menuTitle}
            className={PANEL_CLASS}
          >
            <PanelHeading title={menuTitle} />
            <nav aria-label={`${menuTitle}导航`}>
              {groups.map((items, index) => (
                <ul
                  key={index}
                  className="space-y-0.5 border-border/70 [&:not(:first-child)]:mt-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:pt-3"
                >
                  {items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setPanel(null)}
                          className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm text-foreground outline-hidden transition-colors hover:bg-primary-muted hover:text-primary focus-visible:bg-primary-muted focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:bg-primary-muted aria-[current=page]:font-medium aria-[current=page]:text-primary"
                        >
                          <Icon
                            className="size-[18px]"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ))}
              <Link
                href="/"
                onClick={() => setPanel(null)}
                className="mt-3 flex min-h-11 items-center gap-2.5 rounded-xl border-t border-border/70 px-3 pt-3 text-sm text-foreground-muted outline-hidden transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Home className="size-[18px]" strokeWidth={1.5} aria-hidden />
                返回网站首页
              </Link>
            </nav>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2">
          <Popover
            open={panel === "settings"}
            onOpenChange={(open) => toggle("settings", open)}
          >
            <PopoverTrigger
              aria-label={settingsTitle}
              className="inline-flex size-11 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-surface data-[state=open]:text-primary data-[state=open]:shadow-glass"
            >
              <Settings
                className="size-5 transition-transform duration-300 [[data-state=open]>&]:rotate-45"
                strokeWidth={1.5}
                aria-hidden
              />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              aria-label={settingsTitle}
              className={PANEL_CLASS}
            >
              <PanelHeading title={settingsTitle} />
              {studying && user ? (
                <LearningPreferences userId={user.id} />
              ) : (
                <ThemeModeControl />
              )}
            </PopoverContent>
          </Popover>
          {!hydrated ? (
            <span className="size-8" aria-hidden />
          ) : user ? (
            <AccountMenu />
          ) : (
            <Link
              href="/login"
              className="glass inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium tracking-wide text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
