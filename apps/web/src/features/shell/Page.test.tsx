import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Pager } from "./Page";

it("当前页超出总页数时显示真实页数，上一页直接回到最后一页", () => {
  const onChange = vi.fn();
  render(<Pager page={5} total={2} onChange={onChange} />);
  expect(screen.getByText("5 / 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "上一页" }));
  expect(onChange).toHaveBeenCalledWith(2);
});

it("数据清空后停在第 2 页时也保留上一页并回到第 1 页", () => {
  const onChange = vi.fn();
  render(<Pager page={2} total={0} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "上一页" }));
  expect(onChange).toHaveBeenCalledWith(1);
});

it("只有一页时不渲染分页", () => {
  const { container } = render(
    <Pager page={1} total={1} onChange={() => {}} />
  );
  expect(container).toBeEmptyDOMElement();
});
