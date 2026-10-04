import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HeroVisual } from "./HeroVisual";

it("首页学习示例的拼写与字典音标分开使用字体，词性继承正文", () => {
  render(<HeroVisual />);
  for (const word of screen.getAllByText("vocabulary"))
    expect(word).toHaveClass("tsz-words");
  expect(screen.getByText("/vəˈkæbjələri/")).toHaveClass("tsz-phonetics");
  expect(screen.getByText("n.")).not.toHaveClass("tsz-words");
});
