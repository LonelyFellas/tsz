"use client";
import { useWebText } from "@/i18n/client";
import { webStudentHomeDashboard as webStudentHome } from "@/i18n/messages/student-home/dashboard";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { planStatusLabels } from "@/features/task/components/PlanCoverage";
import { listPlans } from "@/features/task/components/plan-api";
import { useUserStore } from "@/stores/user";
import { AppTopbar } from "@/features/shell/AppTopbar";

export function StudentHome() {
  const uiText = useWebText(webStudentHome);
  const user = useUserStore((state) => state.user);
  if (!user) return null;
  if (!user.roles.includes("student"))
    return (
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-16">
        <h1 className="text-3xl font-semibold">
          {uiText("webStudentHomeDashboard:learning_home")}
        </h1>
        <p role="alert">
          {uiText(
            "webStudentHomeDashboard:you_need_a_student_role_to_use_the_learning_home"
          )}
        </p>
        <Button asChild variant="outline">
          <Link href="/">
            {uiText("webStudentHomeDashboard:go_to_website_home")}
          </Link>
        </Button>
      </main>
    );
  return <HomeWorkspace key={user.id} userId={user.id} />;
}

function HomeWorkspace({ userId }: { userId: string }) {
  const uiText = useWebText(webStudentHome);
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
    featured?.mode !== "legacy_v1"
      ? featured?.current_cycle?.state === "completed"
      : run?.state === "completed";
  const showRun =
    !!run &&
    (continuing ||
      (run.state === "completed" &&
        !(featured?.mastery && featured.can_start)));

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
                {uiText("webStudentHomeDashboard:learning_home")}
              </h1>
              <p className="mt-2 min-h-5 text-[13px] text-foreground-muted">
                {featured &&
                  uiText("webStudentHomeDashboard:v0_v1_word_lists", {
                    v0: uiText(
                      featured.task.task_type === "daily"
                        ? "webStudentHomeDashboard:daily_task"
                        : "webStudentHomeDashboard:long_term_task"
                    ),
                    v1: featured.task.wordlist_ids.length
                  })}
              </p>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
              {tasks.isPending ? (
                <p role="status" className="text-foreground-muted">
                  {uiText("webStudentHomeDashboard:loading_learning_tasks")}
                </p>
              ) : tasks.isError ? (
                <div role="alert" className="space-y-4">
                  <p>
                    {uiText(
                      "webStudentHomeDashboard:could_not_load_learning_tasks_try_again"
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void tasks.refetch()}
                  >
                    {uiText("webStudentHomeDashboard:reload_image")}
                  </Button>
                </div>
              ) : featured ? (
                <>
                  <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
                    {continuing
                      ? uiText("webStudentHomeDashboard:continue_this_round")
                      : featured.mode !== "legacy_v1"
                        ? uiText(planStatusLabels[featured.status])
                        : completed
                          ? uiText("webStudentHomeDashboard:round_completed")
                          : uiText(
                              "webStudentHomeDashboard:your_learning_tasks"
                            )}
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
                      {featured.mastery
                        ? uiText(
                            "webStudentHomeDashboard:confirmed_across_days"
                          )
                        : uiText("webStudentHomeDashboard:covered_this_cycle")}
                      {uiText("webStudentHomeDashboard:v0_v1_questions", {
                        v0: featured.current_cycle.covered_count,
                        v1: featured.current_cycle.total_count
                      })}
                      {featured.task.task_type === "daily" && run && (
                        <p className="mt-2">
                          {uiText(
                            "webStudentHomeDashboard:answered_today_v0_v1",
                            {
                              v0: run.answered_count,
                              v1: run.target_count
                            }
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    run && (
                      <div className="mt-8 w-full max-w-xs space-y-3">
                        <p className="text-sm text-foreground-muted">
                          {uiText(
                            "webStudentHomeDashboard:answered_this_round"
                          )}{" "}
                          <span className="text-xl font-bold tabular-nums text-foreground">
                            {run.answered_count}
                          </span>
                          {uiText("webStudentHomeDashboard:v0_questions", {
                            v0: run.target_count
                          })}
                        </p>
                        <progress
                          aria-label={uiText(
                            "webStudentHomeDashboard:progress_this_round"
                          )}
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
                        ? uiText("webStudentHomeDashboard:continue_practice")
                        : showRun
                          ? uiText("webStudentHomeDashboard:view_records")
                          : uiText("webStudentHomeDashboard:view_task")}
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
                    {uiText(
                      "webStudentHomeDashboard:start_with_your_first_learning_task"
                    )}
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-foreground-muted">
                    {uiText(
                      "webStudentHomeDashboard:choose_word_lists_and_create_a_task_that_suits_you"
                    )}
                  </p>
                  <Button
                    asChild
                    className="mt-8 w-full sm:w-auto sm:min-w-56"
                    size="lg"
                  >
                    <Link href="/student/tasks/new">
                      {uiText("webStudentHomeDashboard:create_learning_task")}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Button asChild variant="link" size="sm">
                <Link href="/student/practice">
                  {uiText("webStudentHomeDashboard:view_all_tasks")}
                </Link>
              </Button>
              <Button asChild variant="link" size="sm">
                <Link href="/student/review">
                  {uiText("webStudentHomeDashboard:review_today")}
                </Link>
              </Button>
              <Button asChild variant="link" size="sm">
                <Link href="/wordlists">
                  {uiText("webStudentHomeDashboard:browse_word_list_library")}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
