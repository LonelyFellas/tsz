"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Globe,
  Home,
  Settings,
  UserRound,
  Wallet,
  X
} from "lucide-react";
import {
  Button,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger
} from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { AccountMenu } from "@/features/home/components/AccountMenu";
import { LearningPreferences } from "./LearningPreferences";

const navigation = [
  { href: "/account/wordlists", label: "我的词表", icon: BookOpen },
  { href: "/student/practice", label: "我的任务", icon: ClipboardList },
  { href: "/wordlists", label: "词库广场", icon: Globe },
  { href: "/account/profile", label: "个人资料", icon: UserRound },
  { href: "/account/coins", label: "天生币", icon: Wallet },
  { href: "/", label: "返回网站首页", icon: Home }
];

function PanelHeading({ title }: { title: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <PopoverClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`关闭${title}`}
        >
          <X className="size-5" strokeWidth={1.5} aria-hidden />
        </Button>
      </PopoverClose>
    </div>
  );
}

export function StudentHome() {
  const user = useUserStore((state) => state.user);
  if (!user) return null;
  if (!user.roles.includes("student"))
    return (
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-16">
        <h1 className="text-3xl font-semibold">学习首页</h1>
        <p role="alert">需要学生身份才能使用学习首页。</p>
        <Button asChild variant="outline">
          <Link href="/">返回网站首页</Link>
        </Button>
      </main>
    );
  return <HomeWorkspace key={user.id} userId={user.id} />;
}

function HomeWorkspace({ userId }: { userId: string }) {
  const [panel, setPanel] = useState<"navigation" | "settings" | null>(null);
  const tasks = useQuery({
    queryKey: ["learning", userId, "home"],
    queryFn: ({ signal }) =>
      api.learning.list(
        { page: 1, page_size: 20, state: "active" },
        { signal }
      ),
    refetchOnMount: "always"
  });
  const items = tasks.data?.items;
  const featured =
    items?.find(({ current_run }) => current_run?.state === "active") ??
    items?.[0];
  const run = featured?.current_run;
  const continuing = run?.state === "active";
  const completed = run?.state === "completed";

  function togglePanel(name: "navigation" | "settings", open: boolean) {
    setPanel((current) => (open ? name : current === name ? null : current));
  }

  return (
    <div className="min-h-dvh bg-muted/50">
      <header className="relative z-50 flex min-h-18 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Popover
          open={panel === "navigation"}
          onOpenChange={(open) => togglePanel("navigation", open)}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="学习菜单"
              className="text-foreground data-[state=open]:bg-surface"
            >
              <span>天生会背</span>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" aria-label="学习菜单">
            <PanelHeading title="学习菜单" />
            <nav aria-label="学习导航" className="space-y-1">
              {navigation.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setPanel(null)}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm outline-hidden hover:bg-primary-muted focus-visible:bg-primary-muted focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
                  {label}
                </Link>
              ))}
            </nav>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-3">
          <Popover
            open={panel === "settings"}
            onOpenChange={(open) => togglePanel("settings", open)}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="学习设置"
                className="data-[state=open]:bg-surface data-[state=open]:text-primary"
              >
                <Settings className="size-5" strokeWidth={1.5} aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" aria-label="学习设置">
              <PanelHeading title="学习设置" />
              <LearningPreferences userId={userId} />
            </PopoverContent>
          </Popover>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-72px)] max-w-5xl items-center px-4 pb-6 sm:px-6">
        <section
          aria-labelledby="learning-home-title"
          className="flex min-h-[min(620px,calc(100dvh-104px))] w-full flex-col rounded-3xl border border-border bg-surface p-6 sm:p-10"
        >
          <div>
            <p className="text-sm font-medium text-primary">学习首页</p>
            <h1
              id="learning-home-title"
              className="mt-2 text-3xl font-semibold tracking-tight"
            >
              从这里，继续积累。
            </h1>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            {tasks.isPending ? (
              <p role="status" className="text-foreground-muted">
                正在读取学习任务…
              </p>
            ) : tasks.isError ? (
              <div role="alert" className="space-y-4">
                <p>学习任务读取失败，请重试。</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void tasks.refetch()}
                >
                  重新读取
                </Button>
              </div>
            ) : featured ? (
              <>
                <p className="text-sm text-foreground-muted">
                  {continuing
                    ? "继续这一轮"
                    : completed
                      ? "本轮已完成"
                      : "你的学习任务"}
                </p>
                <h2 className="mt-4 max-w-full break-words text-3xl font-semibold tracking-tight sm:text-5xl">
                  {featured.task.name}
                </h2>
                <p className="mt-4 text-sm text-foreground-muted">
                  {featured.task.task_type === "daily"
                    ? "每日任务"
                    : "长期任务"}{" "}
                  · {featured.task.wordlist_ids.length} 个词表
                </p>
                {run && (
                  <div className="mt-8 w-full max-w-sm space-y-3">
                    <p className="text-sm">
                      本轮已答{" "}
                      <span className="text-xl font-semibold">
                        {run.answered_count}
                      </span>{" "}
                      / {run.target_count} 题
                    </p>
                    <progress
                      aria-label="本轮答题进度"
                      className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                      value={run.answered_count}
                      max={run.target_count}
                    />
                  </div>
                )}
                <Button asChild className="mt-8" size="lg">
                  <Link
                    href={
                      continuing || completed
                        ? `/student/practice/${run!.id}`
                        : `/student/tasks/${featured.task.id}`
                    }
                  >
                    {continuing
                      ? "继续练习"
                      : completed
                        ? "查看结果"
                        : "查看任务"}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <BookOpen
                  className="size-10 text-primary"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <h2 className="mt-5 text-2xl font-semibold">
                  从第一份学习任务开始
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-foreground-muted">
                  选择想学的词表，创建适合自己的任务。
                </p>
                <Button asChild className="mt-7">
                  <Link href="/student/tasks/new">
                    创建学习任务
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Button asChild variant="link">
              <Link href="/student/practice">查看全部任务</Link>
            </Button>
            <Button asChild variant="link">
              <Link href="/wordlists">浏览词库广场</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
