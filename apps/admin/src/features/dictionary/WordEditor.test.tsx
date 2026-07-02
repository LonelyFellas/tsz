import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WordEditor } from "./WordEditor";

// 创建单词整页表单的冒烟测试：守住「拆分后各分区仍能装配渲染、关键小节都在」，
// 防止 word-editor/* 子模块重构时出现导入错误或装配漏项。
// 依赖 antd App context（VoiceActions 用 App.useApp）与路由（面包屑用 useNavigate）。
function renderEditor() {
  return render(
    <MemoryRouter>
      <AntApp>
        <WordEditor />
      </AntApp>
    </MemoryRouter>
  );
}

describe("WordEditor", () => {
  it("渲染面包屑与各分区小节标题", () => {
    renderEditor();
    // 面包屑末级。
    expect(screen.getByText("创建单词")).toBeInTheDocument();
    // 各分区小节标题均装配到位。
    for (const title of [
      "基础信息",
      "语义区间",
      "基本词性",
      "词形变化",
      "语法结构",
      "多维词义"
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("默认渲染动词词性页与底部操作栏", () => {
    renderEditor();
    // 默认预置一个「动词」词性 Tab。
    expect(screen.getAllByText("动词").length).toBeGreaterThan(0);
    // 底部三个操作。
    expect(screen.getByText("提交")).toBeInTheDocument();
    expect(screen.getByText("保存草稿")).toBeInTheDocument();
    expect(screen.getByText("生成语音")).toBeInTheDocument();
  });

  it("切到「无需分方言」后词形变化仍保留默认「原形」行", async () => {
    renderEditor();
    // 切到「无需分方言」：回退到单一「默认」块，该块仍应有起始的「原形」行。
    // 回归防护：修复前 defaultPos 只种子了方言键，「默认」块会空、原形行消失（数量为 0）。
    fireEvent.click(screen.getByRole("radio", { name: "无需分方言" }));
    await waitFor(() =>
      expect(screen.getAllByDisplayValue("原形").length).toBeGreaterThan(0)
    );
  });
});
