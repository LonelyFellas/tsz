import type { AdminDashboardOverview } from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  buildKpiItems,
  formatAmount,
  toCoinFlow,
  toLearningProgress,
  toLexiconCreation,
  toUserGrowth
} from "./display";

const overview: AdminDashboardOverview = {
  generated_at: "2026-10-24T00:00:00Z",
  users: { total: 12335, today: 234, last_3_days: 25, last_7_days: 10 },
  tasks: { total: 231, completed: 78, today: 3, week: 25 },
  lexicon: { total: 233, today: 23, week: 55, month: 100 },
  coins: {
    circulation: "2313",
    today_net: "23",
    week_net: "-55",
    month_net: "100"
  },
  user_growth: [{ date: "2026-10-23", value: 10 }],
  coin_flow: [{ date: "2026-10-23", grant: "10", deduct: "2" }],
  learning_progress: { completed: 34, in_progress: 41, not_started: 25 },
  lexicon_creation: [{ week_start: "2026-10-19", value: 12 }]
};

function kpi(data: AdminDashboardOverview, key: string) {
  return buildKpiItems(data).find((item) => item.key === key)!;
}

describe("dashboard display", () => {
  it("格式化硬币金额时保留字符串精度并按三位分组", () => {
    expect(formatAmount("2793")).toBe("2,793");
    expect(formatAmount("-1234")).toBe("-1,234");
    expect(formatAmount("0")).toBe("0");
    expect(formatAmount("abc")).toBe("abc");
    expect(formatAmount("9007199254740993")).toBe("9,007,199,254,740,993");
  });

  it("生成 KPI 主值、口径与涨跌方向", () => {
    expect(kpi(overview, "users")).toMatchObject({
      value: "12,335",
      hint: "近三日 25 · 近7日 10",
      delta: { label: "今日", direction: 1, display: "+234" }
    });
    expect(kpi(overview, "tasks")).toMatchObject({
      value: "231",
      hint: "今日 3 · 本周 25 · 进度 34%"
    });
    expect(kpi(overview, "dictionary")).toMatchObject({
      value: "233",
      hint: "今日 23 · 本月 100",
      delta: { label: "本周", direction: 1, display: "+55" }
    });
    expect(kpi(overview, "coin")).toMatchObject({
      value: "2,313",
      hint: "今日 +23 · 本月 +100",
      delta: { label: "本周", direction: -1, display: "-55" }
    });
  });

  it("净投放为零或负零时视为持平，不显示带符号的零", () => {
    const zero = {
      ...overview,
      coins: { ...overview.coins, today_net: "-0", week_net: "0" }
    };
    expect(kpi(zero, "coin")).toMatchObject({
      hint: "今日 0 · 本月 +100",
      delta: { label: "本周", direction: 0, display: "0" }
    });
  });

  it("图表映射保留原始周/日标签和硬币文本", () => {
    expect(toUserGrowth(overview)).toEqual([{ label: "10-23", value: 10 }]);
    expect(toCoinFlow(overview)).toEqual([
      {
        label: "10-23",
        grant: 10,
        deduct: 2,
        grantText: "10",
        deductText: "2"
      }
    ]);
    expect(toLearningProgress(overview)).toEqual([
      { name: "已完成", value: 34 },
      { name: "进行中", value: 41 },
      { name: "未开始", value: 25 }
    ]);
    expect(toLexiconCreation(overview)).toEqual([
      { label: "10-19", value: 12 }
    ]);
  });
});
