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
          <h1>工作台</h1>
          <p>
            {overview.data
              ? new Date(overview.data.generated_at).toLocaleDateString(
                  "zh-CN",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                    timeZone: "Asia/Shanghai"
                  }
                )
              : "平台运营概览"}
          </p>
        </div>
        <div className="dashboard-header-actions">
          {overview.data && (
            <time dateTime={overview.data.generated_at}>
              更新于{" "}
              {new Date(overview.data.generated_at).toLocaleTimeString(
                "zh-CN",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Shanghai"
                }
              )}
            </time>
          )}
          <Button
            aria-label="刷新首页"
            icon={<RefreshCwIcon />}
            loading={overview.isFetching}
            onClick={refresh}
          >
            刷新
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
          title="首页数据加载失败"
          description="请检查网络或稍后重试。"
          action={
            <Button onClick={refresh} loading={overview.isFetching}>
              重试
            </Button>
          }
        />
      )}
      {overview.data && <DashboardContent data={overview.data} />}
    </div>
  );
}

function DashboardContent({ data }: { data: AdminDashboardOverview }) {
  const profile = useAuthStore((s) => s.profile);
  const canVisit = (path: string) => canVisitAdminRoute(profile, path);
  const canViewCoins = usePermission("coins.access");
  const count = (value: number) => value.toLocaleString("zh-CN");
  const progress = [
    { label: "已完成一轮", value: data.learning_progress.completed },
    { label: "进行中", value: data.learning_progress.in_progress },
    { label: "未开始", value: data.learning_progress.not_started }
  ];
  const total = progress.reduce((sum, item) => sum + item.value, 0);
  return (
    <>
      <dl className="dashboard-summary" aria-label="平台规模">
        <div>
          <dt>词库累计</dt>
          <dd>
            {count(data.lexicon.total)}
            <small>条</small>
          </dd>
          <p>
            本周新增 <b>{count(data.lexicon.week)}</b>
          </p>
        </div>
        <div>
          <dt>累计用户</dt>
          <dd>
            {count(data.users.total)}
            <small>人</small>
          </dd>
          <p>
            近 7 日新增 <b>{count(data.users.last_7_days)}</b>
          </p>
        </div>
        <div>
          <dt>学习任务</dt>
          <dd>
            {count(data.tasks.total)}
            <small>个</small>
          </dd>
          <p>
            本周创建 <b>{count(data.tasks.week)}</b>
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
              <h2 id="production-title">词库建设</h2>
              <p>每周新增词条</p>
            </div>
            {canVisit("/words") && (
              <Link to="/words">
                管理词库 <ArrowRightIcon />
              </Link>
            )}
          </div>
          <div className="dashboard-production-numbers">
            <span>
              本月新增 <strong>{count(data.lexicon.month)}</strong>
            </span>
            <span>
              今日新增 <strong>{count(data.lexicon.today)}</strong>
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
              <h2 id="learning-title">今日学习</h2>
              <p>按今日学习任务统计</p>
            </div>
            <span className="dashboard-total">{count(total)} 个任务</span>
          </div>
          {total === 0 ? (
            <div className="dashboard-empty">暂无学习数据</div>
          ) : (
            <dl className="dashboard-progress">
              {progress.map((item) => (
                <div
                  key={item.label}
                  data-state={
                    item.label === "已完成一轮"
                      ? "completed"
                      : item.label === "进行中"
                        ? "in-progress"
                        : "not-started"
                  }
                >
                  <dt>{item.label}</dt>
                  <dd>
                    {count(item.value)}
                    <small>个</small>
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
            累计 {count(data.tasks.completed)} 个学习任务至少完成过一轮。
          </div>
        </section>
        <aside className="dashboard-side-rail" aria-label="运营与工作入口">
          <WorkQueue />
          <section
            className="dashboard-panel dashboard-entries"
            aria-labelledby="entries-title"
          >
            <div className="dashboard-panel-heading">
              <div>
                <h2 id="entries-title">内容工作区</h2>
              </div>
            </div>
            <div className="dashboard-workspaces">
              {[
                {
                  path: "/words",
                  label: "智能词库",
                  hint: "词形、发音与多维词义",
                  icon: LibraryBigIcon
                },
                {
                  path: "/sentences",
                  label: "多维例句",
                  hint: "例句编创与语言资料",
                  icon: BookTextIcon
                },
                {
                  path: "/voices",
                  label: "配音中心",
                  hint: "分组配音与音色管理",
                  icon: Volume2Icon
                },
                {
                  path: "/wordlists",
                  label: "智能词表",
                  hint: "内容组织与词表管理",
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
            天生币流通 <strong>{formatAmount(data.coins.circulation)}</strong>
          </span>
          <span>
            本周净投放 <b>{formatAmount(data.coins.week_net)}</b>
          </span>
          <Link to="/coins">
            查看流水 <ArrowRightIcon />
          </Link>
        </div>
      )}
      {profile?.role === "super_admin" && (
        <details className="dashboard-cost">
          <summary>
            AI 用量与费用 <span>预估金额与计价明细</span>
          </summary>
          <AiCostOverview />
        </details>
      )}
      <p className="dashboard-timezone">
        统计口径：北京时间自然日、周一至今及自然月。词条数量包含不同发布状态。
      </p>
    </>
  );
}

function WorkQueue() {
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
          <h2 id="queue-title">待处理</h2>
          <p>词表与教师申请审核</p>
        </div>
        <ClipboardCheckIcon aria-hidden="true" />
      </div>
      {queueKnown && pendingCount === 0 && (
        <div className="dashboard-queue-clear" role="status">
          <span>
            <CheckCheckIcon aria-hidden="true" />
          </span>
          <strong>暂无待审事项</strong>
        </div>
      )}
      <div className="dashboard-queue-list">
        {reviewsAllowed && (
          <Link to="/reviews">
            <span className="dashboard-queue-icon">
              <BookOpenIcon />
            </span>
            <span>
              词表审核
              <small>
                {reviews.isError ? "读取失败，进入页面重试" : "等待审核的词表"}
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
              教师申请
              <small>
                {teachers.isError ? "读取失败，进入页面重试" : "等待核验的申请"}
              </small>
            </span>
            <strong>
              {teachers.isError ? "—" : (teachers.data?.total ?? "…")}
            </strong>
            <ArrowRightIcon />
          </Link>
        )}
        {!reviewsAllowed && !teachersAllowed && (
          <p className="dashboard-empty">当前账号没有审核队列权限</p>
        )}
      </div>
      {canVisitAdminRoute(profile, "/words/new") && (
        <Link className="dashboard-create" to="/words/new">
          <PlusIcon /> 创建词条 <ArrowRightIcon />
        </Link>
      )}
    </section>
  );
}
