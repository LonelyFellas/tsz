"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { planStatusLabels } from "@/features/task/components/PlanCoverage";
import { listPlans } from "@/features/task/components/plan-api";
import { useUserStore } from "@/stores/user";
import { AppTopbar } from "@/features/shell/AppTopbar";

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
  const tasks = useQuery({
    queryKey: ["learning-plans", userId, "v1-with-legacy", "home"],
    queryFn: ({ signal }) =>
      listPlans({ page: 1, page_size: 20, state: "active" }, { signal }),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always"
  });
  // 重新读取失败时缓存仍在，不能让页头与失败提示各说各话。
  const items = tasks.isError ? undefined : tasks.data?.items;
  const featured = items?.find((plan) => plan.can_start) ?? items?.[0];
  const run = featured?.current_run;
  const continuing = featured?.can_start && run?.state === "active";
  const completed =
    featured?.mode === "coverage_v1"
      ? featured.current_cycle?.state === "completed"
      : run?.state === "completed";
  const showRun = !!run && (continuing || run.state === "completed");

  return (
    <div className="min-h-dvh">
      <AppTopbar />
      <main className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-5xl items-center px-3 pb-6 sm:px-6">
        <section
          aria-labelledby="learning-home-title"
          className="animate-in glass w-full rounded-3xl p-2"
        >
          <div className="flex min-h-[min(640px,calc(100dvh-104px))] flex-col rounded-[20px] bg-surface/70 px-6 py-7 sm:px-10 sm:py-9">
            <div>
              <h1
                id="learning-home-title"
                className="text-2xl font-bold tracking-tight"
              >
                从这里，继续积累。
              </h1>
              <p className="mt-2 text-[13px] text-foreground-muted">
                {featured
                  ? `${featured.task.task_type === "daily" ? "每日任务" : "长期任务"} · ${featured.task.wordlist_ids.length} 个词表`
                  : "学习首页"}
              </p>
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
                  <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
                    {continuing
                      ? "继续这一轮"
                      : featured.mode === "coverage_v1"
                        ? planStatusLabels[featured.status]
                        : completed
                          ? "本轮已完成"
                          : "你的学习任务"}
                  </p>
                  <h2 className="mt-5 max-w-full break-words text-5xl font-bold leading-none tracking-tight sm:text-7xl">
                    {featured.task.name}
                  </h2>
                  <span
                    className="mt-7 h-1.5 w-14 rounded-full bg-primary"
                    aria-hidden
                  />
                  {featured.current_cycle ? (
                    <div className="mt-8 text-sm text-foreground-muted">
                      本轮已覆盖 {featured.current_cycle.covered_count}/
                      {featured.current_cycle.total_count} 题
                      {featured.task.task_type === "daily" && run && (
                        <p className="mt-2">
                          今日已答 {run.answered_count}/{run.target_count} 题
                        </p>
                      )}
                    </div>
                  ) : (
                    run && (
                      <div className="mt-8 w-full max-w-xs space-y-3">
                        <p className="text-sm text-foreground-muted">
                          本轮已答{" "}
                          <span className="text-xl font-bold tabular-nums text-foreground">
                            {run.answered_count}
                          </span>{" "}
                          / {run.target_count} 题
                        </p>
                        <progress
                          aria-label="本轮答题进度"
                          className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                          value={run.answered_count}
                          max={run.target_count}
                        />
                      </div>
                    )
                  )}
                  <Button
                    asChild
                    className="mt-10 w-full sm:w-auto sm:min-w-56"
                    size="lg"
                  >
                    <Link
                      href={
                        showRun
                          ? `/student/practice/${run.id}`
                          : `/student/tasks/${featured.task.id}`
                      }
                    >
                      {continuing
                        ? "继续练习"
                        : showRun
                          ? "查看记录"
                          : "查看任务"}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-surface text-primary shadow-sm">
                    <BookOpen
                      className="size-6"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </span>
                  <h2 className="mt-6 text-2xl font-bold tracking-tight">
                    从第一份学习任务开始
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-foreground-muted">
                    选择想学的词表，创建适合自己的任务。
                  </p>
                  <Button
                    asChild
                    className="mt-8 w-full sm:w-auto sm:min-w-56"
                    size="lg"
                  >
                    <Link href="/student/tasks/new">
                      创建学习任务
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Button asChild variant="link" size="sm">
                <Link href="/student/practice">查看全部任务</Link>
              </Button>
              <Button asChild variant="link" size="sm">
                <Link href="/wordlists">浏览词库广场</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
