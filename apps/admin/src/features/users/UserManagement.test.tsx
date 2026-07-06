import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserManagement } from "./UserManagement";
import * as mock from "./mock";
import { __resetMockUsers } from "./mock";

// 大表格渲染在 jsdom 下偏慢：整表用 getByText（避免 getByRole 逐元素算可访问名，
// CLAUDE.md 明确的超时陷阱），并放宽超时以抗并行运行时的资源竞争。
vi.setConfig({ testTimeout: 15000 });

// UserManagement 走 mock 数据源（USE_MOCK_USERS），无需 mock @/lib/auth 的网络。
// mock 为模块级可变态，写操作会改它——每例前复位避免串味。
beforeEach(() => __resetMockUsers());
// 复位 vi.spyOn（错误路径测试打的 mock 桩），避免泄漏到后续用例。
afterEach(() => vi.restoreAllMocks());

function renderPage() {
  // 关掉 query 重试：错误路径测试要能立刻看到失败态。
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AntApp>
          <UserManagement />
        </AntApp>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** 整表内按可见文案点击第 idx 个匹配按钮（避免 getByRole 扫全表）。 */
function clickRowButton(label: RegExp, idx = 0) {
  fireEvent.click(screen.getAllByText(label)[idx]!);
}

describe("UserManagement", () => {
  it("渲染搜索行、角色 tab 与 mock 用户行", async () => {
    renderPage();
    expect(await screen.findByText("record")).toBeInTheDocument();
    // 角色 tab 是 Segmented（role=radio），与行内「老师/学生」分类 tag 区分开。
    for (const tab of ["全部", "老师", "学生"]) {
      expect(screen.getByRole("radio", { name: tab })).toBeInTheDocument();
    }
    // 等级列渲染（表头「等级」+ 行内「A1等级」等）。
    expect(screen.getAllByText(/等级$/).length).toBeGreaterThan(0);
  });

  it("切换到「老师」tab 只留老师行", async () => {
    renderPage();
    await screen.findByText("record"); // i=0 学生
    fireEvent.click(screen.getByRole("radio", { name: "老师" }));
    await waitFor(() => {
      expect(screen.getByText("work out")).toBeInTheDocument(); // i=1 老师
      expect(screen.queryByText("record")).toBeNull();
    });
  });

  it("按昵称搜索过滤列表", async () => {
    renderPage();
    await screen.findByText("record");
    fireEvent.change(screen.getByPlaceholderText("请输入用户昵称"), {
      target: { value: "screen" }
    });
    fireEvent.click(screen.getByText(/搜\s?索/));
    await waitFor(() => {
      expect(screen.getByText("screen")).toBeInTheDocument();
      expect(screen.queryByText("record")).toBeNull();
    });
  });

  it("点昵称打开只读详情抽屉", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("record"));
    // 「用户 ID」（带空格）是抽屉 Descriptions 独有标签，表格列是「用户ID」（无空格），据此确证抽屉打开。
    expect(await screen.findByText("用户 ID")).toBeInTheDocument();
    // 抽屉体内应能看到该用户的余额等字段（余额值在抽屉与表格都出现，用 getAllByText 容纳）。
    expect(screen.getAllByText("2332").length).toBeGreaterThan(0);
  });

  it("编辑保存改昵称，列表刷新", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/编\s?辑/);
    const input = await screen.findByDisplayValue("record");
    fireEvent.change(input, { target: { value: "记录" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("记录")).toBeInTheDocument());
  });

  it("删除走二次确认后生效", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/删\s?除/);
    // 确认框只有确定/取消两个按钮，此处用 getByRole 不触及大表格，性能无碍。
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /删\s?除/ }));
    expect(await screen.findByText("已删除")).toBeInTheDocument();
  });

  it("启禁用切换给出提示", async () => {
    renderPage();
    await screen.findByText("record");
    // record（i=0）为 active，操作列显示「禁用」。
    clickRowButton(/禁\s?用/);
    expect(await screen.findByText("已禁用")).toBeInTheDocument();
  });

  it("天生币/等级/方言管理点击提示功能待接入", async () => {
    renderPage();
    await screen.findByText("record");
    clickRowButton(/^天生币管理$/);
    expect(
      await screen.findByText("天生币管理功能待接入，接口开发中")
    ).toBeInTheDocument();
    clickRowButton(/^等级管理$/);
    expect(
      await screen.findByText("等级管理功能待接入，接口开发中")
    ).toBeInTheDocument();
    clickRowButton(/^方言管理$/);
    expect(
      await screen.findByText("方言管理功能待接入，接口开发中")
    ).toBeInTheDocument();
  });

  it("翻到第 2 页展示剩余用户", async () => {
    renderPage();
    await screen.findByText("record"); // 第 1 页（前 10 条）
    // antd 分页页码项 title=页码；点第 2 页触发 onChange。
    fireEvent.click(screen.getByTitle("2"));
    // 第 11 条（i=10）昵称是 melody。
    await waitFor(() => expect(screen.getByText("melody")).toBeInTheDocument());
  });

  it("重置按钮清空筛选恢复全部", async () => {
    renderPage();
    await screen.findByText("record");
    fireEvent.change(screen.getByPlaceholderText("请输入用户昵称"), {
      target: { value: "screen" }
    });
    fireEvent.click(screen.getByText(/搜\s?索/));
    await waitFor(() => expect(screen.queryByText("record")).toBeNull());
    fireEvent.click(screen.getByText(/重\s?置/));
    await waitFor(() => expect(screen.getByText("record")).toBeInTheDocument());
  });

  it("启用被禁用的用户", async () => {
    renderPage();
    // transparent（i=6）状态为 disabled，操作列显示「启用」。
    await screen.findByText("transparent");
    clickRowButton(/启\s?用/);
    expect(await screen.findByText("已启用")).toBeInTheDocument();
  });

  it("查看缺手机用户的详情显示占位", async () => {
    renderPage();
    // attitude（i=2）无绑定手机，抽屉里「绑定电话」值为占位「-」。
    fireEvent.click(await screen.findByText("attitude"));
    expect(await screen.findByText("用户 ID")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("列表加载失败展示错误 Alert", async () => {
    vi.spyOn(mock, "mockListUsers").mockImplementation(() => {
      throw new Error("用户炸了");
    });
    renderPage();
    expect(await screen.findByText("用户列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("用户炸了")).toBeInTheDocument();
  });

  it("删除失败给出错误提示", async () => {
    vi.spyOn(mock, "mockDeleteUser").mockImplementation(() => {
      throw new Error("删除炸了");
    });
    renderPage();
    await screen.findByText("record");
    clickRowButton(/删\s?除/);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /删\s?除/ }));
    expect(await screen.findByText("删除炸了")).toBeInTheDocument();
  });

  it("删空第 2 页最后一条后自动回退到第 1 页", async () => {
    renderPage();
    await screen.findByText("record"); // 第 1 页
    // 学生共 11 人：切到「学生」tab 后第 2 页只剩 1 条，删掉它即触发越界回退。
    fireEvent.click(screen.getByRole("radio", { name: "学生" }));
    await waitFor(() => expect(screen.getByTitle("2")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("2"));
    // 第 2 页的唯一一行（第 11 个学生 ribbon），此时第 1 页的 record 已不可见。
    await waitFor(() => expect(screen.queryByText("record")).toBeNull());
    clickRowButton(/删\s?除/);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /删\s?除/ }));
    await screen.findByText("已删除");
    // 回退到第 1 页：page-1 的 record 重新可见（否则会停在空白的第 2 页）。
    await waitFor(() => expect(screen.getByText("record")).toBeInTheDocument());
  });

  it("编辑保存失败给出错误提示且不关闭弹窗", async () => {
    vi.spyOn(mock, "mockUpdateUser").mockImplementation(() => {
      throw new Error("保存炸了");
    });
    renderPage();
    await screen.findByText("record");
    clickRowButton(/编\s?辑/);
    const input = await screen.findByDisplayValue("record");
    fireEvent.change(input, { target: { value: "记录" } });
    fireEvent.click(screen.getByText(/保\s?存/));
    expect(await screen.findByText("保存炸了")).toBeInTheDocument();
    // 弹窗未关闭:输入框仍在。
    expect(screen.getByDisplayValue("记录")).toBeInTheDocument();
  });
});
