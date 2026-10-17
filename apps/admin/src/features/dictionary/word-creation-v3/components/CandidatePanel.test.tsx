import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CandidatePanel } from "./CandidatePanel";
import type { CandidateOption } from "./CandidatePanel";
type Option = CandidateOption<Option>;

it("父项只展开，键盘逐级进入并提交合法叶子，禁用项不提交", async () => {
  const selected = vi.fn();
  const options: Option[] = [
    {
      value: "entry",
      label: "词条",
      children: [
        {
          value: "form",
          label: "词形",
          children: [
            { value: "empty", label: "空词义", disabled: true },
            { value: "sense", label: "有效词义" }
          ]
        }
      ]
    }
  ];
  render(<CandidatePanel options={options} onChange={selected} />);
  fireEvent.keyDown(screen.getByText("词条"), { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "词形" })).toHaveFocus()
  );
  expect(selected).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByText("词形"), { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "有效词义" })).toHaveFocus()
  );
  fireEvent.click(screen.getByText("空词义"));
  expect(selected).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("有效词义"));
  expect(
    selected.mock.calls[0]![0].map((option: Option) => option.value)
  ).toEqual(["entry", "form", "sense"]);
});
