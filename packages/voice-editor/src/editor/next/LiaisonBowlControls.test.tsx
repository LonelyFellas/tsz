import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { LiaisonBowl } from "@tsz/types";
import { prepareBowl } from "../../marks/liaisonBowl";
import { LiaisonBowlControls } from "./LiaisonBowlControls";

function renderControls(initialBowl: LiaisonBowl = {}) {
  const commit = vi.fn();
  const arc = {
    index: 0,
    key: "0",
    d: "",
    pose: prepareBowl({ x: 5, tipY: 16 }, { x: 60, tipY: 16 }, 18, 15, [], 3, 1)
  };
  function Example() {
    const [bowl, setBowl] = useState(initialBowl);
    const [preview, onPreview] = useState<LiaisonBowl>();
    const [target, setTarget] = useState<keyof LiaisonBowl>("curve_pct");
    return (
      <LiaisonBowlControls
        bowl={bowl}
        preview={preview}
        arc={arc}
        target={target}
        disabled={false}
        onTarget={setTarget}
        onPreview={onPreview}
        onCommit={(value) => {
          commit(value);
          setBowl(value);
        }}
      />
    );
  }
  return { ...render(<Example />), commit };
}

it("拖动只预览，松开一次回写；Esc 后直到松开都不回写", () => {
  const { container, commit } = renderControls();
  const track = container.querySelector<HTMLElement>(".ui-slider")!;
  const rect = DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 24 });
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(rect);
  let captured = false;
  track.setPointerCapture = () => {
    captured = true;
  };
  track.hasPointerCapture = () => captured;
  track.releasePointerCapture = () => {
    captured = false;
  };
  const move = (type: "pointerDown" | "pointerMove" | "pointerUp", x: number) =>
    fireEvent[type](track, {
      button: 0,
      pointerId: 1,
      isPrimary: true,
      clientX: x,
      clientY: 12
    });
  const thumb = screen.getByRole("slider", { name: "整弧" });
  fireEvent.pointerDown(track, {
    button: 2,
    pointerId: 1,
    isPrimary: true,
    clientX: 140
  });
  expect(commit).not.toHaveBeenCalled();
  move("pointerDown", 112);
  fireEvent.pointerDown(track, {
    button: 0,
    pointerId: 2,
    isPrimary: false,
    clientX: 140
  });
  fireEvent.pointerCancel(track, { pointerId: 2 });
  move("pointerMove", 135);
  move("pointerMove", 170);
  expect(thumb).toHaveAttribute("aria-valuenow", "70");
  const input = screen.getByRole("textbox", { name: "整弧调整百分比" });
  expect(input).toHaveValue("70");
  expect(commit).not.toHaveBeenCalled();
  move("pointerUp", 170);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenLastCalledWith({ curve_pct: 70 });
  move("pointerDown", 80);
  move("pointerMove", 40);
  fireEvent.keyDown(thumb, { key: "Escape" });
  move("pointerMove", 60);
  move("pointerUp", 60);
  expect(thumb).toHaveAttribute("aria-valuenow", "70");
  expect(input).toHaveValue("70");
  expect(commit).toHaveBeenCalledTimes(1);
});

it("整弧输入在确认时只提交一次，且保留两端设置", () => {
  const ends = { left_tip_pct: 10, right_tip_pct: -20 };
  const { commit } = renderControls(ends);
  const input = screen.getByRole("textbox", { name: "整弧调整百分比" });
  const thumb = screen.getByRole("slider", { name: "整弧" });

  for (const value of ["-", "-6", "-68"])
    fireEvent.change(input, { target: { value } });
  expect(thumb).toHaveAttribute("aria-valuenow", "0");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith({ ...ends, curve_pct: -68 });
  expect(thumb).toHaveAttribute("aria-valuenow", "-68");

  fireEvent.change(input, { target: { value: "+42" } });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledTimes(2);
  expect(commit).toHaveBeenLastCalledWith({ ...ends, curve_pct: 42 });
  expect(thumb).toHaveAttribute("aria-valuenow", "42");
});

it("无效值和取消的修改不回写，端点仍通过滑杆调整", () => {
  const { commit } = renderControls({ curve_pct: -68 });
  const input = screen.getByRole("textbox", { name: "整弧调整百分比" });

  for (const value of ["101", "-101", "12.5", "1e2", ""]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(input).toHaveValue("-68");
  }
  fireEvent.change(input, { target: { value: "10" } });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.blur(input);
  expect(input).toHaveValue("-68");
  expect(commit).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("radio", { name: "左端点" }));
  expect(input).not.toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "左端点" })).toBeInTheDocument();
});
