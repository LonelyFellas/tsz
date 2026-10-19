import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createWordRowPreview, WordRowDragPreview } from "./WordRowDragPreview";

it("完整保留当前表单值、展开注释及高度，预览不重复标签或参与交互", () => {
  const { container } = render(
    <div id="row-source">
      <label htmlFor="word-source">词条</label>
      <input id="word-source" aria-label="词条 1" defaultValue="old" />
      <textarea
        id="note-source"
        aria-label="注 1"
        aria-describedby="note-help"
        style={{ height: 160 }}
        defaultValue=""
      />
      <p id="note-help">随词表公开。</p>
    </div>
  );
  const source = container.firstElementChild as HTMLElement;
  const input = source.querySelector("input")!;
  const note = source.querySelector("textarea")!;
  fireEvent.change(input, { target: { value: "apple" } });
  fireEvent.change(note, { target: { value: "展开中的注释" } });
  vi.spyOn(source, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ width: 600, height: 360 })
  );

  const snapshot = createWordRowPreview(source);
  const preview = render(<WordRowDragPreview snapshot={snapshot} />);
  expect(snapshot.querySelector("input")).toHaveValue("apple");
  expect(snapshot.querySelector("textarea")).toHaveValue("展开中的注释");
  expect(snapshot.querySelector("textarea")).toHaveStyle({ height: "160px" });
  expect(snapshot).toHaveStyle({ height: "360px", transform: "none" });
  expect(snapshot).not.toHaveAttribute("id");
  expect(
    snapshot.querySelector("[id], [for], [aria-label], [aria-describedby]")
  ).toBeNull();
  expect(snapshot.parentElement).toHaveAttribute("inert");
  expect(snapshot.parentElement).toHaveAttribute("aria-hidden", "true");
  preview.unmount();
  expect(snapshot.isConnected).toBe(false);
  expect(input).toHaveValue("apple");
  expect(note).toHaveValue("展开中的注释");
});
