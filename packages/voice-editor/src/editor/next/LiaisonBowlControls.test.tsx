import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { LiaisonBowl } from "@tsz/types";
import { prepareBowl } from "../../marks/liaisonBowl";
import { LiaisonBowlControls } from "./LiaisonBowlControls";

it("拖动只预览，松开一次回写；Esc 后直到松开都不回写", () => {
  const commit = vi.fn();
  const arc = {
    index: 0,
    key: "0",
    d: "",
    pose: prepareBowl({ x: 5, tipY: 16 }, { x: 60, tipY: 16 }, 18, 15, [], 3, 1)
  };
  function Example() {
    const [bowl, setBowl] = useState<LiaisonBowl>({});
    const [preview, onPreview] = useState<LiaisonBowl>();
    return (
      <LiaisonBowlControls
        bowl={bowl}
        preview={preview}
        arc={arc}
        target="curve_pct"
        disabled={false}
        onTarget={() => {}}
        onPreview={onPreview}
        onCommit={(value) => {
          commit(value);
          setBowl(value);
        }}
      />
    );
  }
  const { container } = render(<Example />);
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
  expect(commit).toHaveBeenCalledTimes(1);
});
