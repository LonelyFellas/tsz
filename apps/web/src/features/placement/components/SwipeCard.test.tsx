import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SwipeCard } from "./SwipeCard";

afterEach(() => vi.unstubAllGlobals());

it("词汇测试卡片的英文拼写使用词语字体，不继承衬线字体", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<SwipeCard word="apple" onAnswer={vi.fn()} />);
  expect(screen.getByText("apple")).toHaveClass("tsz-words");
  expect(screen.getByText("apple")).not.toHaveClass("font-serif");
  expect(screen.getByText("你认识这个单词吗？")).not.toHaveClass("tsz-words");
});
