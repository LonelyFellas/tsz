"use client";
import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webShell } from "@/i18n/messages/shell";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type LucideIcon,
  BarChart3,
  BookOpen,
  BookSearch,
  ChevronDown,
  ClipboardList,
  Globe,
  Home,
  LayoutGrid,
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
import { BrandMark } from "@/features/home/components/BrandMark";
import { AccountControls, type TopbarPanel } from "./AccountControls";

type NavItem = {
  href: string;
  label: import("@/i18n/catalog").WebNotice;
  icon: LucideIcon;
};

const STUDENT_NAV: NavItem[][] = [
  [
    {
      href: "/account/wordlists",
      label: localText(webShell, "webShell:my_word_lists"),
      icon: BookOpen
    },
    {
      href: "/student/practice",
      label: localText(webShell, "webShell:my_tasks"),
      icon: ClipboardList
    },
    {
      href: "/student/review",
      label: localText(webShell, "webShell:review_today"),
      icon: BookOpen
    },
    {
      href: "/dictionary",
      label: localText(webShell, "webShell:dictionary"),
      icon: BookSearch
    },
    {
      href: "/wordlists",
      label: localText(webShell, "webShell:word_list_library"),
      icon: Globe
    }
  ],
  [
    {
      href: "/student/home",
      label: localText(webShell, "webShell:learning_home"),
      icon: LayoutGrid
    },
    {
      href: "/account/coins",
      label: localText(webShell, "webShell:coins"),
      icon: Wallet
    },
    {
      href: "/account/profile",
      label: localText(webShell, "webShell:profile"),
      icon: UserRound
    }
  ]
];

const TEACHER_NAV: NavItem[][] = [
  [
    {
      href: "/teacher/classes",
      label: localText(webShell, "webShell:my_classes"),
      icon: Users
    },
    {
      href: "/teacher/tasks",
      label: localText(webShell, "webShell:teaching_tasks"),
      icon: ClipboardList
    },
    {
      href: "/teacher/stats",
      label: localText(webShell, "webShell:learning_data"),
      icon: BarChart3
    }
  ],
  [
    {
      href: "/account/wordlists",
      label: localText(webShell, "webShell:my_word_lists"),
      icon: BookOpen
    },
    {
      href: "/dictionary",
      label: localText(webShell, "webShell:dictionary"),
      icon: BookSearch
    },
    {
      href: "/wordlists",
      label: localText(webShell, "webShell:word_list_library"),
      icon: Globe
    },
    {
      href: "/account/profile",
      label: localText(webShell, "webShell:profile"),
      icon: UserRound
    }
  ]
];

// 已登录但既非学生、也不在教学工作台：只保留与学习身份无关的入口。
const ACCOUNT_NAV: NavItem[][] = [
  [
    {
      href: "/account/wordlists",
      label: localText(webShell, "webShell:my_word_lists"),
      icon: BookOpen
    },
    {
      href: "/dictionary",
      label: localText(webShell, "webShell:dictionary"),
      icon: BookSearch
    },
    {
      href: "/wordlists",
      label: localText(webShell, "webShell:word_list_library"),
      icon: Globe
    }
  ],
  [
    {
      href: "/account/coins",
      label: localText(webShell, "webShell:coins"),
      icon: Wallet
    },
    {
      href: "/account/profile",
      label: localText(webShell, "webShell:profile"),
      icon: UserRound
    }
  ]
];

const GUEST_NAV: NavItem[][] = [
  [
    {
      href: "/dictionary",
      label: localText(webShell, "webShell:dictionary"),
      icon: BookSearch
    },
    {
      href: "/wordlists",
      label: localText(webShell, "webShell:word_list_library"),
      icon: Globe
    }
  ]
];

const PANEL_CLASS =
  "tsz-drawer w-[330px] rounded-3xl border-border/60 bg-surface/90 p-5 shadow-float backdrop-blur-xl";

function PanelHeading({ title }: { title: string }) {
  const uiText = useWebText(webShell);
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <PopoverClose
        aria-label={uiText("webShell:close_v0", { v0: title })}
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

// 学习区与主区共用顶栏：左侧品牌菜单，右侧通知与账户入口。
export function AppTopbar() {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  return <TopbarPanels key={user?.id ?? "guest"} hydrated={hydrated} />;
}

function TopbarPanels({ hydrated }: { hydrated: boolean }) {
  const uiText = useWebText(webShell);
  const user = useUserStore((s) => s.user);
  const identity = useTeacherIdentity();
  const pathname = usePathname() ?? "";
  const [panel, setPanel] = useState<TopbarPanel>(null);

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
  const menuTitle = uiText(
    teaching
      ? "webShell:teaching_menu"
      : studying
        ? "webShell:learning_menu"
        : "webShell:website_menu"
  );

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
            {uiText("webShell:brand")}
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
            onCloseAutoFocus={(event) => {
              if (panel === "account" || panel === "settings")
                event.preventDefault();
            }}
          >
            <PanelHeading title={menuTitle} />
            <nav
              aria-label={uiText("webShell:v0_navigation", { v0: menuTitle })}
            >
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
                          {uiText(label)}
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
                {uiText("webShell:go_to_website_home")}
              </Link>
            </nav>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2">
          <AccountControls
            panel={panel}
            setPanel={setPanel}
            studying={studying}
            guestPreferences
          />
          {!hydrated ? (
            <span className="size-8" aria-hidden />
          ) : !user ? (
            <Link
              href="/login"
              className="glass inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium tracking-wide text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {uiText("webShell:sign_in")}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
