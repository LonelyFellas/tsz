import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WordListDetail } from "./WordListDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

const setup = () => render(<WordListDetail id="wl-demo-1" />);

describe("WordListDetail", () => {
  it("渲染词表名与创建者", () => {
    setup();
    expect(
      screen.getByRole("heading", {
        name: "初中英语(人教 2024 新版)① 七年级上 Unit 1 · 课本基础词表"
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/Steven 杨老师/)).toBeInTheDocument();
  });

  it("默认标准显示:有语法结构列,无完整模式专属列", () => {
    const { container } = setup();
    expect(screen.getByText("语法结构")).toBeInTheDocument();
    expect(screen.queryByText("词形变化")).not.toBeInTheDocument();
    expect(screen.queryByText("基本词性")).not.toBeInTheDocument();
    // 词性缩写列(centre 与 dress up 各有动词块)
    expect(screen.getAllByText("v.")).toHaveLength(2);
    expect(screen.getByText("n.")).toBeInTheDocument();
    expect(container.textContent).toContain(
      "something centres; to centre something"
    );
  });

  it("简洁显示:隐藏语法结构列", () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "简洁" }));
    expect(screen.queryByText("语法结构")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("something centres");
    // 释义仍在
    expect(screen.getByText("位于中央; 将其置于中央.")).toBeInTheDocument();
  });

  it("完整显示:序号、词条类型、音标、基本词性、词形变化与细分词性", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "完整" }));
    expect(screen.getByText("词形变化")).toBeInTheDocument();
    expect(screen.getByText("细分词性")).toBeInTheDocument();
    expect(screen.getAllByText("VERB 动词")).toHaveLength(2);
    expect(screen.getByText("NOUN 名词")).toBeInTheDocument();
    expect(screen.getByText("单词")).toBeInTheDocument();
    expect(screen.getByText("词组")).toBeInTheDocument();
    expect(screen.getByText("/ˈsentə/")).toBeInTheDocument();
    expect(screen.getByText("现在分词")).toBeInTheDocument();
    expect(screen.getByText("centring")).toBeInTheDocument();
    expect(screen.getAllByText("及物动词").length).toBeGreaterThan(0);
    // 简洁/标准的词性缩写列被基本词性徽章取代
    expect(screen.queryByText("v.")).not.toBeInTheDocument();
  });

  it("切美式:拼写、词形与语法措辞整体切换", () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "美式" }));
    // 词条列与语法结构里的蓝色词都会命中,只需保证 uk 拼写彻底消失
    expect(screen.getAllByText("center").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("centre")).toHaveLength(0);
    expect(container.textContent).toContain(
      "something centers; to center something"
    );

    fireEvent.click(screen.getByRole("button", { name: "英式" }));
    expect(screen.getAllByText("centre").length).toBeGreaterThan(0);
  });

  it("切换按钮以 aria-pressed 标注当前档位", () => {
    setup();
    const standard = screen.getByRole("button", { name: "标准" });
    const compact = screen.getByRole("button", { name: "简洁" });
    expect(standard).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(compact);
    expect(compact).toHaveAttribute("aria-pressed", "true");
    expect(standard).toHaveAttribute("aria-pressed", "false");
  });

  it("输出 PDF 走浏览器打印", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    setup();
    fireEvent.click(screen.getByRole("button", { name: /输出 PDF/ }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
