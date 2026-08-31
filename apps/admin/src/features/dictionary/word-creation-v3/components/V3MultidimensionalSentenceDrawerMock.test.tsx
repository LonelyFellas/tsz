import { fireEvent, render, screen, within } from "@testing-library/react";
import { App as AntApp } from "antd";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { V3MultidimensionalSentenceDrawerMock } from "./V3MultidimensionalSentenceDrawerMock";

function renderDrawer(onClose = vi.fn()) {
  render(
    <AntApp>
      <V3MultidimensionalSentenceDrawerMock onClose={onClose} open />
    </AntApp>
  );
  return onClose;
}

function DrawerHarness() {
  const [open, setOpen] = useState(true);
  return (
    <AntApp>
      <button type="button" onClick={() => setOpen(true)}>
        重新打开
      </button>
      <V3MultidimensionalSentenceDrawerMock
        onClose={() => setOpen(false)}
        open={open}
      />
    </AntApp>
  );
}

describe("V3MultidimensionalSentenceDrawerMock", () => {
  it("按例句、句中标记、关联分组与分层译文建立完成态层级", () => {
    renderDrawer();

    expect(screen.getByText("新增多维例句")).toBeVisible();
    expect(screen.getByText("前端 Mock")).toBeVisible();
    expect(screen.getByText("01 · 例句本体")).toBeVisible();
    expect(screen.getByText("02 · 句中成分标记")).toBeVisible();
    expect(screen.getByText("03 · 已关联单词 / 短语")).toBeVisible();
    expect(screen.getByText("04 · 分层中文译文")).toBeVisible();

    expect(screen.getByText("目标词 · center")).toBeVisible();
    expect(screen.getByText("目标词 · wall")).toBeVisible();
    expect(screen.getByText("短语候选 · on the center of")).toBeVisible();
    expect(screen.getByText("过去分词")).toBeVisible();
    expect(screen.getAllByText("BrE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AmE").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("它位于墙的中央。")).toBeVisible();
    expect(
      screen.getByDisplayValue("它正好居于墙面的中心位置。")
    ).toBeVisible();
    expect(
      screen.getByDisplayValue("它以墙体正中为中心进行布局。")
    ).toBeVisible();
  });

  it("本地编辑英文与 CEFR 后标记匹配过期，词块定位和模拟匹配可恢复", () => {
    renderDrawer();

    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: {
        value: "It is centered on the center of the wall today."
      }
    });
    expect(screen.getByText("英文已修改，请重新模拟匹配")).toBeVisible();

    fireEvent.mouseDown(screen.getByLabelText("CEFR 等级"));
    fireEvent.click(screen.getByText("C1"));
    expect(screen.getByLabelText("CEFR 等级")).toHaveAttribute(
      "aria-label",
      "CEFR 等级"
    );

    fireEvent.click(screen.getByLabelText("选择句中词 center"));
    expect(screen.getByText(/当前定位：center/u)).toBeVisible();
    expect(screen.getByLabelText("选择句中词 center")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "模拟匹配" }));
    expect(
      screen.getByText("Mock 匹配已刷新：仅更新抽屉内的展示状态。")
    ).toBeVisible();
    expect(screen.queryByText("英文已修改，请重新模拟匹配")).toBeNull();
  });

  it("按首词和尾词自定义连续多个单词组成词语", () => {
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "标记词语" }));
    expect(
      screen.getByText("先选择起始词，再选择结束词；至少包含两个单词。")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "组为词语" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("选择句中词 It"));
    expect(screen.getByText("已选起点：It，请继续选择结束词。")).toBeVisible();
    expect(screen.getByRole("button", { name: "组为词语" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("选择句中词 centered"));
    expect(screen.getByText("待组成词语：It is centered")).toBeVisible();
    expect(screen.getByRole("button", { name: "组为词语" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "组为词语" }));
    expect(screen.getByText("自定义短语 · It is centered")).toBeVisible();
    expect(
      screen.getByText(
        "Mock 词语已建立：It is centered。仅更新抽屉内的展示状态。"
      )
    ).toBeVisible();
  });

  it("自定义短语预填可编辑的 Pending 词义且关闭后重置", () => {
    render(<DrawerHarness />);

    fireEvent.click(screen.getByRole("button", { name: "标记词语" }));
    fireEvent.click(screen.getByLabelText("选择句中词 It"));
    fireEvent.click(screen.getByLabelText("选择句中词 centered"));
    fireEvent.click(screen.getByRole("button", { name: "组为词语" }));

    const pendingSense = screen.getByLabelText("自定义短语待关联词义");
    expect(pendingSense).toHaveValue("“It is centered”的待确认词义");
    fireEvent.change(pendingSense, {
      target: { value: "它处于居中状态。" }
    });
    expect(pendingSense).toHaveValue("它处于居中状态。");
    expect(screen.getByText("待关联词义")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b(?:Linked|Pending)\b/u);

    fireEvent.click(screen.getByRole("button", { name: /^取\s?消$/u }));
    fireEvent.click(screen.getByRole("button", { name: "重新打开" }));
    expect(screen.getByLabelText("自定义短语待关联词义")).toHaveValue(
      "位于……的中心位置"
    );
    expect(screen.queryByDisplayValue("它处于居中状态。")).toBeNull();
  });

  it("支持本地生成、增删和编辑分层译文", () => {
    renderDrawer();
    const translationSection = screen
      .getByText("04 · 分层中文译文")
      .closest("section") as HTMLElement;

    fireEvent.change(screen.getByLabelText("高阶译文 3"), {
      target: { value: "临时高阶译文" }
    });
    expect(screen.getByDisplayValue("临时高阶译文")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "添加译文" }));
    expect(
      within(translationSection).getAllByLabelText(
        /^(初阶|中阶|高阶)译文 \d+$/u
      )
    ).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("中阶译文 4"), {
      target: { value: "新增的本地译文" }
    });
    expect(screen.getByDisplayValue("新增的本地译文")).toBeVisible();

    fireEvent.click(screen.getByLabelText("删除译文 4"));
    expect(screen.queryByDisplayValue("新增的本地译文")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "模拟生成" }));
    expect(screen.getByDisplayValue("它位于墙的正中央。")).toBeVisible();
    expect(
      screen.getByText("Mock 译文已生成：未调用 AI，也未写入业务数据。")
    ).toBeVisible();
  });

  it("保存预览只反馈不关闭，取消关闭且重新打开恢复代表性样例", () => {
    render(<DrawerHarness />);

    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "A local-only draft." }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存预览" }));
    expect(
      screen.getByText("预览已暂存在抽屉内存，未写入词条或父级草稿。")
    ).toBeVisible();
    expect(screen.getByDisplayValue("A local-only draft.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /^取\s?消$/u }));
    expect(screen.queryByText("01 · 例句本体")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重新打开" }));
    expect(
      screen.getByDisplayValue("It is centered on the center of the wall.")
    ).toBeVisible();
    expect(screen.queryByDisplayValue("A local-only draft.")).toBeNull();
  });
});
