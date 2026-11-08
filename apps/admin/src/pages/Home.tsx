import { useDashboardTranslation } from "@/features/dashboard/i18n";
import { Alert, Button, Skeleton } from "@tsz/ui/admin/display";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminDashboardOverview } from "@tsz/types";
import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  RefreshCwIcon,
  PlusIcon,
  CheckCheckIcon,
  Volume2Icon,
  LibraryBigIcon,
  ListChecksIcon,
  BookTextIcon
} from "lucide-react";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { canVisitAdminRoute } from "@/lib/adminPageRoutes";
import { AiCostOverview } from "@/features/dashboard/AiCostOverview";
import { ContentTrend } from "@/features/dashboard/ContentTrend";
import { formatAmount } from "@/features/dashboard/display";
import "./home.css";

export function HomePage() {
  const { t, i18n } = useDashboardTranslation();
  const profile = useAuthStore((s) => s.profile);
  const client = useQueryClient();
  const refresh = () => {
    void overview.refetch();
    void client.invalidateQueries({
      queryKey: ["dashboard-review-queue", profile?.id]
    });
    void client.invalidateQueries({
      queryKey: ["dashboard-teacher-queue", profile?.id]
    });
  };
  const overview = useQuery({
    queryKey: ["admin-dashboard", profile?.id, "overview"],
    enabled: !!profile,
    queryFn: ({ signal }) => api.dashboard.overview({ signal })
  });
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>{t("title")}</h1>
          <p>
            {overview.data
              ? new Date(overview.data.generated_at).toLocaleDateString(
                  i18n.language,
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                    timeZone: "Asia/Shanghai"
                  }
                )
              : t("overview")}
          </p>
        </div>
        <div className="dashboard-header-actions">
          {overview.data && (
            <time dateTime={overview.data.generated_at}>
              {t("updated")}{" "}
              {new Date(overview.data.generated_at).toLocaleTimeString(
                i18n.language,
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Shanghai"
                }
              )}
            </time>
          )}
          <Button
            aria-label={t("refresh_home")}
            icon={<RefreshCwIcon />}
            loading={overview.isFetching}
            onClick={refresh}
          >
            {t("refresh")}
          </Button>
        </div>
      </header>
      {overview.isPending && (
        <div className="dashboard-panel" aria-busy="true">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      )}
      {overview.isError && (
        <Alert
          type="error"
          showIcon
          title={t("load_failed")}
          description={t("retry_help")}
          action={
            <Button onClick={refresh} loading={overview.isFetching}>
              {t("retry")}
            </Button>
          }
        />
      )}
      {overview.data && <DashboardContent data={overview.data} />}
    </div>
  );
}

function DashboardContent({ data }: { data: AdminDashboardOverview }) {
  const { t, i18n } = useDashboardTranslation();
  const profile = useAuthStore((s) => s.profile);
  const canVisit = (path: string) => canVisitAdminRoute(profile, path);
  const canViewCoins = usePermission("coins.access");
  const count = (value: number) => value.toLocaleString(i18n.language);
  const progress = [
    {
      state: "completed",
      label: t("completed"),
      value: data.learning_progress.completed
    },
    {
      state: "in-progress",
      label: t("in_progress"),
      value: data.learning_progress.in_progress
    },
    {
      state: "not-started",
      label: t("not_started"),
      value: data.learning_progress.not_started
    }
  ];
  const total = progress.reduce((sum, item) => sum + item.value, 0);
  return (
    <>
      <dl className="dashboard-summary" aria-label={t("platform_scale")}>
        <div>
          <dt>{t("entries_total")}</dt>
          <dd>
            {count(data.lexicon.total)}
            <small>{t("entry_unit", { count: data.lexicon.total })}</small>
          </dd>
          <p>
            {t("new_week")}
            <b>{count(data.lexicon.week)}</b>
          </p>
        </div>
        <div>
          <dt>{t("users_total")}</dt>
          <dd>
            {count(data.users.total)}
            <small>{t("user_unit", { count: data.users.total })}</small>
          </dd>
          <p>
            {t("new_seven_days")}
            <b>{count(data.users.last_7_days)}</b>
          </p>
        </div>
        <div>
          <dt>{t("tasks")}</dt>
          <dd>
            {count(data.tasks.total)}
            <small>{t("task_unit", { count: data.tasks.total })}</small>
          </dd>
          <p>
            {t("created_week")}
            <b>{count(data.tasks.week)}</b>
          </p>
        </div>
      </dl>
      <div className="dashboard-main-grid">
        <section
          className="dashboard-panel dashboard-production"
          aria-labelledby="production-title"
        >
          <div className="dashboard-panel-heading">
            <div>
              <h2 id="production-title">{t("production")}</h2>
              <p>{t("weekly_entries")}</p>
            </div>
            {canVisit("/words") && (
              <Link to="/words">
                {t("manage_lexicon")}
                <ArrowRightIcon />
              </Link>
            )}
          </div>
          <div className="dashboard-production-numbers">
            <span>
              {t("new_month")}
              <strong>{count(data.lexicon.month)}</strong>
            </span>
            <span>
              {t("new_today")}
              <strong>{count(data.lexicon.today)}</strong>
            </span>
          </div>
          <ContentTrend
            data={data.lexicon_creation}
            generatedAt={data.generated_at}
          />
        </section>
        <section
          className="dashboard-panel dashboard-learning"
          aria-labelledby="learning-title"
        >
          <div className="dashboard-panel-heading">
            <div>
              <h2 id="learning-title">{t("learning_today")}</h2>
              <p>{t("today_scope")}</p>
            </div>
            <span className="dashboard-total">
              {t("task_count", { count: total })}
            </span>
          </div>
          {total === 0 ? (
            <div className="dashboard-empty">{t("no_learning")}</div>
          ) : (
            <dl className="dashboard-progress">
              {progress.map((item) => (
                <div key={item.state} data-state={item.state}>
                  <dt>{item.label}</dt>
                  <dd>
                    {count(item.value)}
                    <small>{t("task_unit", { count: item.value })}</small>
                  </dd>
                  <div
                    className="dashboard-meter"
                    role="meter"
                    aria-label={item.label}
                    aria-valuenow={item.value}
                    aria-valuemin={0}
                    aria-valuemax={total}
                  >
                    <span style={{ width: `${(item.value / total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          )}
          <div className="dashboard-footnote">
            {t("tasks_completed", { total: count(data.tasks.completed) })}
          </div>
        </section>
        <aside className="dashboard-side-rail" aria-label={t("operations")}>
          <WorkQueue />
          <section
            className="dashboard-panel dashboard-entries"
            aria-labelledby="entries-title"
          >
            <div className="dashboard-panel-heading">
              <div>
                <h2 id="entries-title">{t("workspaces")}</h2>
              </div>
            </div>
            <div className="dashboard-workspaces">
              {[
                {
                  path: "/words",
                  label: t("entries"),
                  hint: t("entries_help"),
                  icon: LibraryBigIcon
                },
                {
                  path: "/sentences",
                  label: t("sentences"),
                  hint: t("sentences_help"),
                  icon: BookTextIcon
                },
                {
                  path: "/voices",
                  label: t("voices"),
                  hint: t("voices_help"),
                  icon: Volume2Icon
                },
                {
                  path: "/wordlists",
                  label: t("wordlists"),
                  hint: t("wordlists_help"),
                  icon: ListChecksIcon
                }
              ]
                .filter((item) => canVisit(item.path))
                .map((item) => (
                  <Link to={item.path} key={item.path}>
                    <span className="dashboard-workspace-icon">
                      <item.icon aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    <ArrowRightIcon />
                  </Link>
                ))}
            </div>
          </section>
        </aside>
      </div>
      {canViewCoins && (
        <div className="dashboard-finance">
          <span>
            {t("circulation")}
            <strong>{formatAmount(data.coins.circulation)}</strong>
          </span>
          <span>
            {t("net_week")}
            <b>{formatAmount(data.coins.week_net)}</b>
          </span>
          <Link to="/coins">
            {t("ledger")}
            <ArrowRightIcon />
          </Link>
        </div>
      )}
      {profile?.role === "super_admin" && (
        <details className="dashboard-cost">
          <summary>
            {t("ai_usage")}
            <span>{t("estimates")}</span>
          </summary>
          <AiCostOverview />
        </details>
      )}
      <p className="dashboard-timezone">{t("time_scope")}</p>
    </>
  );
}

function WorkQueue() {
  const { t } = useDashboardTranslation();
  const profile = useAuthStore((s) => s.profile);
  const reviewsAllowed = canVisitAdminRoute(profile, "/reviews");
  const teachersAllowed = canVisitAdminRoute(profile, "/teacher-applications");
  const reviews = useQuery({
    queryKey: [
      "dashboard-review-queue",
      profile?.id,
      profile?.permission_version
    ],
    enabled: reviewsAllowed,
    queryFn: ({ signal }) =>
      api.wordlists.management(
        { page: 1, page_size: 1, review_state: "pending" },
        { signal }
      ),
    retry: false,
    gcTime: 0
  });
  const teachers = useQuery({
    queryKey: [
      "dashboard-teacher-queue",
      profile?.id,
      profile?.permission_version
    ],
    enabled: teachersAllowed,
    queryFn: () => api.teacherCertification.list(1, 1, "pending"),
    retry: false,
    gcTime: 0
  });
  const queueKnown =
    (reviewsAllowed || teachersAllowed) &&
    (!reviewsAllowed || reviews.isSuccess) &&
    (!teachersAllowed || teachers.isSuccess);
  const pendingCount =
    (reviewsAllowed ? (reviews.data?.pagination.total ?? 0) : 0) +
    (teachersAllowed ? (teachers.data?.total ?? 0) : 0);
  return (
    <section
      className="dashboard-panel dashboard-queue"
      aria-labelledby="queue-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <h2 id="queue-title">{t("queue")}</h2>
          <p>{t("queue_scope")}</p>
        </div>
        <ClipboardCheckIcon aria-hidden="true" />
      </div>
      {queueKnown && pendingCount === 0 && (
        <div className="dashboard-queue-clear" role="status">
          <span>
            <CheckCheckIcon aria-hidden="true" />
          </span>
          <strong>{t("queue_empty")}</strong>
        </div>
      )}
      <div className="dashboard-queue-list">
        {reviewsAllowed && (
          <Link to="/reviews">
            <span className="dashboard-queue-icon">
              <BookOpenIcon />
            </span>
            <span>
              {t("review_wordlists")}
              <small>
                {reviews.isError ? t("queue_failed") : t("waiting_wordlists")}
              </small>
            </span>
            <strong>
              {reviews.isError ? "—" : (reviews.data?.pagination.total ?? "…")}
            </strong>
            <ArrowRightIcon />
          </Link>
        )}
        {teachersAllowed && (
          <Link to="/teacher-applications">
            <span className="dashboard-queue-icon">
              <GraduationCapIcon />
            </span>
            <span>
              {t("teachers")}
              <small>
                {teachers.isError ? t("queue_failed") : t("waiting_teachers")}
              </small>
            </span>
            <strong>
              {teachers.isError ? "—" : (teachers.data?.total ?? "…")}
            </strong>
            <ArrowRightIcon />
          </Link>
        )}
        {!reviewsAllowed && !teachersAllowed && (
          <p className="dashboard-empty">{t("queue_forbidden")}</p>
        )}
      </div>
      {canVisitAdminRoute(profile, "/words/new") && (
        <Link className="dashboard-create" to="/words/new">
          <PlusIcon /> {t("create_entry")} <ArrowRightIcon />
        </Link>
      )}
    </section>
  );
}
