import { useDashboardTranslation } from "@/features/dashboard/i18n";
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Skeleton
} from "@tsz/ui/admin/display";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminDashboardOverview } from "@tsz/types";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
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
import { CountUp } from "@/features/dashboard/CountUp";
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
      <PageHeader
        title={t("title")}
        actions={
          <>
            {overview.data && (
              <time
                className="dashboard-updated"
                dateTime={overview.data.generated_at}
              >
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
            {canVisitAdminRoute(profile, "/words/new") && (
              <Link className="ui-btn ui-btn-primary" to="/words/new">
                <PlusIcon aria-hidden="true" />
                {t("create_entry")}
              </Link>
            )}
          </>
        }
      >
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
      </PageHeader>
      {overview.isPending && (
        <Card aria-busy="true">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
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

function PanelTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="dashboard-panel-title">
      {children}
    </h2>
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
      <dl className="dashboard-kpis" aria-label={t("platform_scale")}>
        <div className="dashboard-kpi">
          <dt>{t("entries_total")}</dt>
          <dd>
            <CountUp value={data.lexicon.total} format={count} />
            <small>{t("entry_unit", { count: data.lexicon.total })}</small>
          </dd>
          <p>
            {t("new_week")}
            <b>{count(data.lexicon.week)}</b>
          </p>
        </div>
        <div className="dashboard-kpi">
          <dt>{t("users_total")}</dt>
          <dd>
            <CountUp value={data.users.total} format={count} />
            <small>{t("user_unit", { count: data.users.total })}</small>
          </dd>
          <p>
            {t("new_seven_days")}
            <b>{count(data.users.last_7_days)}</b>
          </p>
        </div>
        <div className="dashboard-kpi">
          <dt>{t("tasks")}</dt>
          <dd>
            <CountUp value={data.tasks.total} format={count} />
            <small>{t("task_unit", { count: data.tasks.total })}</small>
          </dd>
          <p>
            {t("created_week")}
            <b>{count(data.tasks.week)}</b>
          </p>
        </div>
        {canViewCoins && (
          <div className="dashboard-kpi">
            <dt>{t("circulation")}</dt>
            <dd>
              <CountUp
                value={Number(data.coins.circulation)}
                format={(value) => formatAmount(String(value))}
                final={formatAmount(data.coins.circulation)}
              />
            </dd>
            <p>
              {t("net_week")}
              <b>{formatAmount(data.coins.week_net)}</b>
              <Link to="/coins">
                {t("ledger")}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </p>
          </div>
        )}
      </dl>
      <div className="dashboard-grid">
        <div className="dashboard-column">
          <Card
            role="region"
            aria-labelledby="production-title"
            title={
              <PanelTitle id="production-title">{t("production")}</PanelTitle>
            }
            extra={
              canVisit("/words") && (
                <Link className="dashboard-more" to="/words">
                  {t("manage_lexicon")}
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              )
            }
          >
            <ContentTrend
              data={data.lexicon_creation}
              generatedAt={data.generated_at}
            />
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
          </Card>
          <Card
            role="region"
            aria-labelledby="learning-title"
            title={
              <PanelTitle id="learning-title">{t("learning_today")}</PanelTitle>
            }
            extra={
              <span className="dashboard-total">
                {t("task_count", { count: total })}
              </span>
            }
          >
            {total === 0 ? (
              <div className="dashboard-empty">{t("no_learning")}</div>
            ) : (
              <dl className="dashboard-progress">
                {progress.map((item) => (
                  <div key={item.state} data-state={item.state}>
                    <dt>{item.label}</dt>
                    <dd>
                      <CountUp value={item.value} format={count} />
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
                      <span
                        style={{ width: `${(item.value / total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
            )}
            <div className="dashboard-footnote">
              {t("tasks_completed", { total: count(data.tasks.completed) })}
            </div>
          </Card>
          {profile?.role === "super_admin" && (
            <details className="dashboard-cost">
              <summary>
                {t("ai_usage")}
                <span>{t("estimates")}</span>
              </summary>
              <AiCostOverview />
            </details>
          )}
        </div>
        <aside className="dashboard-column" aria-label={t("operations")}>
          <WorkQueue />
          <Card
            role="region"
            aria-labelledby="entries-title"
            title={
              <PanelTitle id="entries-title">{t("workspaces")}</PanelTitle>
            }
          >
            <div className="dashboard-links">
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
                    <span className="dashboard-link-icon">
                      <item.icon aria-hidden="true" />
                    </span>
                    <span className="dashboard-link-text">
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                ))}
            </div>
          </Card>
        </aside>
      </div>
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
    <Card
      role="region"
      aria-labelledby="queue-title"
      title={<PanelTitle id="queue-title">{t("queue")}</PanelTitle>}
      extra={
        queueKnown &&
        pendingCount === 0 && (
          <span className="dashboard-queue-clear" role="status">
            <CheckCheckIcon aria-hidden="true" />
            {t("queue_empty")}
          </span>
        )
      }
    >
      <div className="dashboard-links">
        {reviewsAllowed && (
          <Link to="/reviews">
            <span className="dashboard-link-icon">
              <BookOpenIcon aria-hidden="true" />
            </span>
            <span className="dashboard-link-text">
              <strong>{t("review_wordlists")}</strong>
              <small>
                {reviews.isError ? t("queue_failed") : t("waiting_wordlists")}
              </small>
            </span>
            <span className="dashboard-link-count">
              {reviews.isError ? "—" : (reviews.data?.pagination.total ?? "…")}
            </span>
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        )}
        {teachersAllowed && (
          <Link to="/teacher-applications">
            <span className="dashboard-link-icon">
              <GraduationCapIcon aria-hidden="true" />
            </span>
            <span className="dashboard-link-text">
              <strong>{t("teachers")}</strong>
              <small>
                {teachers.isError ? t("queue_failed") : t("waiting_teachers")}
              </small>
            </span>
            <span className="dashboard-link-count">
              {teachers.isError ? "—" : (teachers.data?.total ?? "…")}
            </span>
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        )}
        {!reviewsAllowed && !teachersAllowed && (
          <p className="dashboard-empty">{t("queue_forbidden")}</p>
        )}
      </div>
    </Card>
  );
}
