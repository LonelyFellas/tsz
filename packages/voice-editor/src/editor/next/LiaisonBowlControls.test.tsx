import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { LiaisonBowl } from "@tsz/types";
import { prepareBowl } from "../../marks/liaisonBowl";
import { LiaisonBowlControls } from "./LiaisonBowlControls";

function renderControls(initialBowl: LiaisonBowl = {}, em = 18, gap = 3) {
  const commit = vi.fn();
  const arc = {
    index: 0,
    key: "0",
    d: "",
    pose: prepareBowl(
      { x: 5, tipY: 16 },
      { x: 60, tipY: 16 },
      em,
      15,
      [],
      gap,
      1
    )
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

it("整弧的无效值和取消的修改不回写", () => {
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
});

it("端点输入像素位移，提交后与对应滑杆同步并保留其他调整", () => {
  const { commit } = renderControls({ curve_pct: 20, left_tip_pct: 10 });
  fireEvent.click(screen.getByRole("radio", { name: "右端点" }));
  const right = screen.getByRole("textbox", { name: "右端点位移（像素）" });
  const slider = screen.getByRole("slider", { name: "右端点" });
  expect(right).toHaveValue("0");

  for (const value of ["-2.6", "7.3", "1e0"]) {
    fireEvent.change(right, { target: { value } });
    fireEvent.keyDown(right, { key: "Enter" });
    expect(right).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(right);
    expect(right).toHaveValue("0");
  }
  fireEvent.change(right, { target: { value: "-1.5" } });
  fireEvent.keyDown(right, { key: "Escape" });
  expect(right).toHaveValue("0");
  expect(commit).not.toHaveBeenCalled();

  fireEvent.change(right, { target: { value: "-1.49" } });
  expect(slider).toHaveAttribute("aria-valuenow", "0");
  fireEvent.keyDown(right, { key: "Enter" });
  fireEvent.blur(right);
  expect(commit).toHaveBeenCalledExactlyOnceWith({
    curve_pct: 20,
    left_tip_pct: 10,
    right_tip_pct: -60
  });
  expect(slider).toHaveAttribute("aria-valuenow", "-60");
  expect(right).toHaveValue("-1.5");
  fireEvent.keyDown(slider, { key: "End" });
  expect(right).toHaveValue("7.2");

  fireEvent.click(screen.getByRole("radio", { name: "左端点" }));
  const left = screen.getByRole("textbox", { name: "左端点位移（像素）" });
  fireEvent.change(left, { target: { value: "+3.6" } });
  fireEvent.blur(left);
  expect(commit).toHaveBeenCalledTimes(3);
  expect(commit).toHaveBeenLastCalledWith({
    curve_pct: 20,
    left_tip_pct: 50,
    right_tip_pct: 100
  });
  expect(screen.getByRole("slider", { name: "左端点" })).toHaveAttribute(
    "aria-valuenow",
    "50"
  );
});

it("端点按实测边界校验，最大位移的读数也在可输入范围内", () => {
  const { commit } = renderControls({}, 18.1, 3.06);
  fireEvent.click(screen.getByRole("radio", { name: "右端点" }));
  const input = screen.getByRole("textbox", { name: "右端点位移（像素）" });

  fireEvent.change(input, { target: { value: "7.24" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(commit).toHaveBeenCalledExactlyOnceWith({ right_tip_pct: 100 });

  fireEvent.change(input, { target: { value: "-2.6" } });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledTimes(1);

  fireEvent.change(input, { target: { value: "-2.56" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(commit).toHaveBeenCalledTimes(2);
  expect(commit).toHaveBeenLastCalledWith({ right_tip_pct: -100 });
  expect(input).toHaveValue("-2.56");
});
