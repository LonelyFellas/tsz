import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { recordResult } from "../lib/quota";
import { QuotaExhaustedError, type BlockItem } from "../lib/types";
import { PlacementFlow } from "./PlacementFlow";

// 经装配点注入假 client,脚本化 start/submit 的每种响应,驱动流程编排的全部分支。
// 手势/动画路径(SwipeCard 内部)不在此测(见 vitest.config.ts 的排除说明),
// 作答一律走按钮/键盘备选输入——reduced-motion 垫片使作答同步完成,无动画等待。

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("../lib/client", () => ({
  assessmentClient: { start: vi.fn(), submit: vi.fn() }
}));

import { assessmentClient } from "../lib/client";

const mockPush = vi.fn();
const mockStart = vi.mocked(assessmentClient.start);
const mockSubmit = vi.mocked(assessmentClient.submit);

const QUOTA_KEY = "tsz.placement.quota";

beforeAll(() => {
  // jsdom 无 matchMedia;返回 reduced-motion 命中,让 SwipeCard 同步作答、跳过动画。
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

/** 第 n 块的 5 张卡(4 真 + 1 假的形状,内容对组件不可见)。 */
function block(n: number): BlockItem[] {
  return Array.from({ length: 5 }, (_, i) => ({
    item_id: `b${n}_${i}`,
    text: `block${n}-word${i}`
  }));
}

function seedQuota(used: number, band?: string) {
  window.localStorage.setItem(
    QUOTA_KEY,
    JSON.stringify({
      used,
      last: band ? { band, at: "2026-07-01T00:00:00Z" } : null
    })
  );
}

async function answerFive(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 5; i++) {
    await user.click(screen.getByRole("button", { name: "← 认识" }));
  }
}

describe("PlacementFlow — 欢迎屏与开测", () => {
  it("新用户看到卖点文案,点开始测试直接进入答题", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    expect(screen.getByText("1 分钟，测出你的词汇量")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "开始测试" }));

    expect(await screen.findByText("block1-word0")).toBeInTheDocument();
    expect(screen.getByText(/01 \/ 约 25/)).toBeInTheDocument();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("开始测试失败(通用错误)→ 欢迎屏显示错误文案", async () => {
    mockStart.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));

    expect(
      await screen.findByText("开始测试失败，请稍后重试")
    ).toBeInTheDocument();
  });

  it("服务端判定配额已尽 → 回欢迎屏并刷新配额,不显示通用错误", async () => {
    // 本地认为还有次数(权威在服务端):start 抛 QuotaExhaustedError
    seedQuota(1, "B1");
    mockStart.mockRejectedValueOnce(new QuotaExhaustedError());
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "重新测试" }));
    await user.click(screen.getByRole("button", { name: "确认重测" }));

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("你的词汇档案")).toBeInTheDocument();
    expect(screen.queryByText("开始测试失败，请稍后重试")).toBeNull();
  });

  it("已有结果重测需确认;取消则不开测", async () => {
    seedQuota(1, "B1");
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    expect(screen.getByText(/当前等级 B1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新测试" }));

    const dialog = screen.getByRole("dialog", { name: "重新测试？" });
    expect(dialog).toHaveTextContent("新结果将覆盖当前的 B1 等级");
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("次数用尽且有留存结果 → 查看结果(留存口径文案)", async () => {
    seedQuota(3, "A2");
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "查看结果" }));

    expect(screen.getByText("你的词汇等级")).toBeInTheDocument();
    // 等级同时出现在徽章与六档刻度上
    expect(screen.getAllByText("A2").length).toBeGreaterThan(0);
    expect(
      screen.getByText("测试机会已用完 · 以最后一次结果为准")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新测试" })).toBeNull();
  });

  it("次数用尽且无留存结果(本地存储被清洗)→ 主按钮禁用而非死按钮", () => {
    // readQuota 会把非法 band 清洗成 last:null,但保留 used
    window.localStorage.setItem(
      QUOTA_KEY,
      JSON.stringify({ used: 3, last: { band: "Z9", at: "x" } })
    );
    renderWithProviders(<PlacementFlow />);

    expect(screen.getByRole("button", { name: "开始测试" })).toBeDisabled();
    expect(
      screen.getByText("测试机会已用完 · 以最后一次结果为准")
    ).toBeInTheDocument();
  });
});

describe("PlacementFlow — 答题与块提交", () => {
  it("答满 5 题提交本块;next_block 无感进入下一块", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    mockSubmit.mockResolvedValueOnce({ next_block: block(2) });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
    await answerFive(user);

    expect(await screen.findByText("block2-word0")).toBeInTheDocument();
    expect(screen.getByText(/06 \/ 约 25/)).toBeInTheDocument();
    expect(mockSubmit).toHaveBeenCalledWith(
      "s1",
      expect.arrayContaining([
        expect.objectContaining({ item_id: "b1_0", known: true })
      ])
    );
    expect(mockSubmit.mock.calls[0]?.[1]).toHaveLength(5);
  });

  it("键盘 ←/→ 可作答", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByText(/02 \/ 约 25/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText(/03 \/ 约 25/)).toBeInTheDocument();
  });

  it("完成测试 → 结果屏展示等级,应用等级跳 onboarding 预选", async () => {
    seedQuota(0);
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    mockSubmit.mockImplementationOnce(async () => {
      // 模拟真 client 的落账行为(mock.ts 在 completed 时 recordResult)
      recordResult("B2", "2026-07-19T00:00:00Z");
      return {
        result: { state: "completed", band: "B2", vocab_range: "约 3,000 词" }
      };
    });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
    await answerFive(user);

    expect(await screen.findByText("你的词汇等级")).toBeInTheDocument();
    // 等级同时出现在徽章与六档刻度上
    expect(screen.getAllByText("B2").length).toBeGreaterThan(0);
    expect(
      screen.getByText("剩余 2 次机会 · 以最后一次结果为准")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "应用该等级，继续设置" })
    );
    expect(mockPush).toHaveBeenCalledWith("/onboarding?level=B2");
  });

  it("用掉最后一次机会 → 结果屏按「以本次结果为准」口径展示", async () => {
    seedQuota(2, "A1");
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    mockSubmit.mockImplementationOnce(async () => {
      recordResult("C1", "2026-07-19T00:00:00Z");
      return {
        result: { state: "completed", band: "C1", vocab_range: "约 8,000 词" }
      };
    });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "重新测试" }));
    await user.click(screen.getByRole("button", { name: "确认重测" }));
    await screen.findByText("block1-word0");
    await answerFive(user);

    expect(
      await screen.findByText("测试机会已用完 · 以本次结果为准")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新测试" })).toBeNull();
  });

  it("作答无效 → 无效屏;再测一次重新开始", async () => {
    mockStart.mockResolvedValue({ session_id: "s1", block: block(1) });
    mockSubmit.mockResolvedValueOnce({
      result: { state: "invalid", reason: "too_many_false_alarms" }
    });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
    await answerFive(user);

    expect(await screen.findByText("这次作答不太稳定")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "再测一次" }));
    expect(await screen.findByText("block1-word0")).toBeInTheDocument();
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("无效屏跳过 → 手动选择等级(不带预选)", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    mockSubmit.mockResolvedValueOnce({
      result: { state: "invalid", reason: "too_many_false_alarms" }
    });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
    await answerFive(user);
    await screen.findByText("这次作答不太稳定");

    await user.click(
      screen.getByRole("button", { name: "跳过，手动选择等级" })
    );
    expect(mockPush).toHaveBeenCalledWith("/onboarding");
  });

  it("块提交失败 → 保留作答,重试后继续", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    mockSubmit
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ next_block: block(2) });
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
    await answerFive(user);

    expect(await screen.findByText("提交失败，请检查网络")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("block2-word0")).toBeInTheDocument();
    // 两次提交携带同一块作答(失败不丢作答)
    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(mockSubmit.mock.calls[1]?.[1]).toEqual(
      mockSubmit.mock.calls[0]?.[1]
    );
  });

  it("提交在途时退出按钮禁用(不可中断在途计次)", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    mockSubmit.mockImplementationOnce(() => new Promise(() => {})); // 永挂起
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
    await answerFive(user);

    expect(await screen.findByText("正在准备下一组…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出测试" })).toBeDisabled();
  });

  it("长会话(6 块)题号封顶在预估总数,不出现 26 / 约 25", async () => {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    for (let n = 2; n <= 6; n++) {
      mockSubmit.mockResolvedValueOnce({ next_block: block(n) });
    }
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "开始测试" }));
    for (let n = 1; n <= 5; n++) {
      await screen.findByText(`block${n}-word0`);
      await answerFive(user);
    }

    // 第 6 块第 1 题是全场第 26 题:题号钳在 25
    await screen.findByText("block6-word0");
    expect(screen.getByText(/25 \/ 约 25/)).toBeInTheDocument();
  });
});

describe("PlacementFlow — 退出测试", () => {
  async function enterQuiz(user: ReturnType<typeof userEvent.setup>) {
    mockStart.mockResolvedValueOnce({ session_id: "s1", block: block(1) });
    await user.click(screen.getByRole("button", { name: "开始测试" }));
    await screen.findByText("block1-word0");
  }

  it("✕ → 确认退出 → 回欢迎屏,不消耗次数", async () => {
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();
    await enterQuiz(user);

    await user.click(screen.getByRole("button", { name: "退出测试" }));
    const dialog = screen.getByRole("dialog", { name: "退出测试？" });
    expect(dialog).toHaveTextContent("不消耗测试机会");
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(
      await screen.findByText("1 分钟，测出你的词汇量")
    ).toBeInTheDocument();
    expect(screen.getByText(/剩余 3 次/)).toBeInTheDocument();
  });

  it("✕ → 取消 → 留在答题屏", async () => {
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();
    await enterQuiz(user);

    await user.click(screen.getByRole("button", { name: "退出测试" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("block1-word0")).toBeInTheDocument();
  });

  it("Esc 与点遮罩均可关闭确认弹窗", async () => {
    renderWithProviders(<PlacementFlow />);
    const user = userEvent.setup();
    await enterQuiz(user);

    await user.click(screen.getByRole("button", { name: "退出测试" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "退出测试" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
