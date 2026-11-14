import { useDashboardTranslation } from "@/features/dashboard/i18n";
import { CountUp } from "./CountUp";
import { useState } from "react";
import type { DashboardWeeklyPoint } from "@tsz/types";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartNoAxesColumnIcon, Table2Icon } from "lucide-react";
import { Link } from "react-router-dom";
import { canVisitAdminRoute } from "@/lib/adminPageRoutes";
import { useAuthStore } from "@/lib/auth";

/** Weekly buckets use calendar dates directly; UTC arithmetic prevents local timezone shifts. */
export function weekEnd(start: string) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export function ContentTrend({
  data,
  generatedAt
}: {
  data: DashboardWeeklyPoint[];
  generatedAt?: string;
}) {
  const reducedMotion =
    !window.matchMedia ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { t, i18n } = useDashboardTranslation();
  const [table, setTable] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>();
  const profile = useAuthStore((s) => s.profile);
  const selected =
    data.find((item) => item.week_start === selectedWeek) ?? data.at(-1);
  const date = generatedAt
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(generatedAt))
    : undefined;
  const ongoing =
    selected &&
    date &&
    selected.week_start <= date &&
    weekEnd(selected.week_start) >= date;
  const detailLink = selected
    ? `/words?created_from=${selected.week_start}&created_to=${weekEnd(selected.week_start)}&created_timezone=Asia%2FShanghai`
    : "/words";
  return (
    <div className="dashboard-trend">
      <div className="dashboard-chart-heading">
        <div className="dashboard-week-stat" aria-live="polite">
          <span>
            {selected
              ? `${selected.week_start.slice(5).replace("-", ".")} — ${weekEnd(selected.week_start).slice(5).replace("-", ".")}`
              : t("no_week")}
            {ongoing && <small>{t("ongoing_week")}</small>}
          </span>
          <strong>
            {selected ? (
              <CountUp
                value={selected.value}
                format={(value) => value.toLocaleString(i18n.language)}
              />
            ) : (
              "—"
            )}
            <small>{t("new_entries")}</small>
          </strong>
        </div>
        <div
          className="dashboard-chart-controls"
          role="group"
          aria-label={t("display_mode")}
        >
          <button
            type="button"
            aria-pressed={!table}
            onClick={() => setTable(false)}
          >
            <ChartNoAxesColumnIcon aria-hidden="true" />
            {t("chart")}
          </button>
          <button
            type="button"
            aria-pressed={table}
            onClick={() => setTable(true)}
          >
            <Table2Icon aria-hidden="true" />
            {t("data")}
          </button>
        </div>
      </div>
      {table ? (
        <div className="dashboard-data-table">
          <table>
            <caption className="sr-only">{t("weekly_table")}</caption>
            <thead>
              <tr>
                <th>{t("week_start")}</th>
                <th>{t("new_entries")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr
                  key={point.week_start}
                  data-selected={
                    point.week_start === selected?.week_start || undefined
                  }
                >
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedWeek(point.week_start)}
                      aria-pressed={point.week_start === selected?.week_start}
                    >
                      {point.week_start}
                    </button>
                  </td>
                  <td>{point.value.toLocaleString(i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !data.length || data.every((point) => point.value === 0) ? (
        <div className="dashboard-empty dashboard-trend-empty">
          {t("no_recent_entries")}
        </div>
      ) : (
        <div
          className="dashboard-chart"
          role="group"
          aria-label={t("chart_label")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 12, right: 10, left: -12, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#edf0f5" />
              <XAxis
                dataKey="week_start"
                tick={false}
                height={8}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#667085", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: "#f5f7fb" }}
                labelFormatter={(label) =>
                  t("week_tooltip", { date: String(label) })
                }
                formatter={(value) => [
                  Number(value).toLocaleString(i18n.language),
                  t("new_entries")
                ]}
                contentStyle={{
                  border: 0,
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow: "0 5px 20px rgb(24 39 65 / 12%)"
                }}
              />
              <Bar
                dataKey="value"
                name={t("new_entries")}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={600}
                animationEasing="ease-out"
                onClick={(_entry, index) =>
                  setSelectedWeek(data[index]?.week_start)
                }
              >
                {data.map((point) => (
                  <Cell
                    key={point.week_start}
                    fill={
                      point.week_start === selected?.week_start
                        ? "#2053ff"
                        : "#aebbd0"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        className="dashboard-week-selector"
        role="group"
        aria-label={t("select_week")}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))`
        }}
      >
        {data.map((point) => (
          <button
            key={point.week_start}
            type="button"
            aria-label={t("view_week", { date: point.week_start })}
            aria-pressed={point.week_start === selected?.week_start}
            onClick={() => setSelectedWeek(point.week_start)}
          >
            {point.week_start.slice(5).replace("-", ".")}
          </button>
        ))}
      </div>
      <div className="dashboard-chart-footer">
        {selected && canVisitAdminRoute(profile, "/words") && (
          <Link to={detailLink}>{t("week_entries")}</Link>
        )}
      </div>
    </div>
  );
}
