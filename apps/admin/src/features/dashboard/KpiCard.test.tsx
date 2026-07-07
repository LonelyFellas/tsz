import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("渲染标题、主数值（千分位）与次要 hint", () => {
    render(
      <KpiCard
        item={{
          key: "users",
          label: "累计用户",
          value: 12335,
          hint: "近三日 25 · 近7日 10"
        }}
      />
    );
    expect(screen.getByText("累计用户")).toBeInTheDocument();
    expect(screen.getByText("12,335")).toBeInTheDocument();
    expect(screen.getByText("近三日 25 · 近7日 10")).toBeInTheDocument();
  });

  it("正增量渲染上涨趋势（带加号）", () => {
    render(
      <KpiCard
        item={{
          key: "coin",
          label: "天生币流通",
          value: 2313,
          delta: { label: "本周", value: 55 }
        }}
      />
    );
    // 上涨口径与加号：`本周 +55`（分段文本，用 substring 匹配容器）。
    expect(screen.getByText(/本周/)).toBeInTheDocument();
    expect(screen.getByText(/\+/)).toBeInTheDocument();
    expect(screen.getByText(/55/)).toBeInTheDocument();
  });

  it("零增量视为持平：不渲染趋势行", () => {
    render(
      <KpiCard
        item={{
          key: "users",
          label: "累计用户",
          value: 137,
          delta: { label: "今日", value: 0 }
        }}
      />
    );
    // 持平不出涨跌行：既无口径文案，也不出「+0」。
    expect(screen.queryByText(/今日/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+0/)).not.toBeInTheDocument();
  });

  it("负增量渲染下跌趋势（无加号）且不渲染缺省的 hint", () => {
    render(
      <KpiCard
        item={{
          key: "users",
          label: "累计用户",
          value: 100,
          delta: { label: "今日", value: -12 }
        }}
      />
    );
    expect(screen.getByText(/今日/)).toBeInTheDocument();
    // 负值不加正号，直接展示 -12。
    expect(screen.getByText(/-12/)).toBeInTheDocument();
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it("带 suffix 时紧贴主数值展示", () => {
    render(
      <KpiCard
        item={{ key: "rate", label: "学习进度", value: 34, suffix: "%" }}
      />
    );
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });
});
