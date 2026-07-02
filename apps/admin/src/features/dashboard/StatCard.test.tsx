import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  const items = [
    { label: "累计", value: "12335" },
    { label: "今日", value: "234" }
  ];

  it("渲染标题与每个指标的数值和标签", () => {
    render(<StatCard title="用户数据" items={items} />);
    expect(
      screen.getByRole("heading", { name: "用户数据" })
    ).toBeInTheDocument();
    // antd Statistic 会给数字加千分位分隔。
    expect(screen.getByText("12,335")).toBeInTheDocument();
    expect(screen.getByText("累计")).toBeInTheDocument();
    expect(screen.getByText("234")).toBeInTheDocument();
    expect(screen.getByText("今日")).toBeInTheDocument();
  });

  it("渲染传入的操作位", () => {
    render(
      <StatCard title="天生币" items={items} action={<button>发放</button>} />
    );
    expect(screen.getByRole("button", { name: "发放" })).toBeInTheDocument();
  });
});
