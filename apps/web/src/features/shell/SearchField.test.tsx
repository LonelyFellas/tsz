import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

function Example({ onClear }: { onClear?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <SearchField
      aria-label="搜索内容"
      value={value}
      onValueChange={setValue}
      onClear={onClear}
    />
  );
}

it("点击清空后恢复焦点，Escape 也能清空当前搜索", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const input = screen.getByRole("searchbox", { name: "搜索内容" });
  await user.type(input, "apple");
  await user.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
  expect(screen.queryByRole("button", { name: "清除搜索" })).toBeNull();
  await user.type(input, "pear{Escape}");
  expect(input).toHaveValue("");
});

it("输入法确认期间不响应 Escape，禁用时不能清空", () => {
  const onClear = vi.fn();
  const { rerender } = render(
    <SearchField
      aria-label="搜索内容"
      value="中文"
      onValueChange={vi.fn()}
      onClear={onClear}
    />
  );
  const input = screen.getByRole("searchbox");
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(onClear).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(onClear).toHaveBeenCalledOnce();
  rerender(
    <SearchField
      aria-label="搜索内容"
      value="中文"
      onValueChange={vi.fn()}
      disabled
    />
  );
  expect(screen.getByRole("button", { name: "清除搜索" })).toBeDisabled();
});
