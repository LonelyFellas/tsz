import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  annotationErrors,
  EntryAnnotationModal,
  type AnnotationRow
} from "./EntryAnnotationModal";

const rows: AnnotationRow[] = [
  { key: "a", label: "center", annotation: "01" },
  { key: "b", label: "center", annotation: "02" },
  { key: "incoming", label: "center", annotation: null, incoming: true }
];
const groups = [
  { dialect_scope: "uk", normalized_surface: "center", entry_ids: ["a", "b"] }
];

describe("词条标注", () => {
  it("第三条校验旧旧、旧新重复和空白，trim后保持前导0字符串", () => {
    const save = vi.fn();
    render(
      <EntryAnnotationModal
        rows={rows}
        groups={groups}
        creating
        onSave={save}
        onClose={vi.fn()}
      />
    );
    const old = screen.getAllByLabelText("center标注");
    const incoming = screen.getByLabelText("新建词条标注");
    const button = screen.getByText("保存标注并创建").closest("button")!;
    expect(incoming).toHaveAttribute("inputmode", "numeric");
    expect(incoming).not.toHaveAttribute("type", "number");
    expect(button).toBeDisabled();
    fireEvent.change(old[1]!, { target: { value: "01" } });
    expect(screen.getAllByText("同组标注不能相同")).toHaveLength(2);
    fireEvent.change(old[1]!, { target: { value: "02" } });
    fireEvent.change(incoming, { target: { value: " 01 " } });
    expect(button).toBeDisabled();
    fireEvent.change(incoming, { target: { value: " 1 " } });
    fireEvent.click(button);
    expect(save).toHaveBeenCalledWith({ a: "01", b: "02", incoming: "1" });
  });

  it.each([true, false])(
    "创建/编辑creating=%s均保留非法输入并阻止提交，20位可保存",
    (creating) => {
      const save = vi.fn();
      render(
        <EntryAnnotationModal
          rows={[{ key: "a", label: "center", annotation: null }]}
          groups={[]}
          creating={creating}
          onSave={save}
          onClose={vi.fn()}
        />
      );
      const input = screen.getByLabelText("center标注");
      const button = screen
        .getByText(creating ? "保存标注并创建" : "保存标注")
        .closest("button")!;
      for (const invalid of [
        "中文",
        "abc",
        "-1",
        "+1",
        "1.2",
        "1e3",
        "😀",
        "１２",
        "١٢",
        "1 2",
        "1\u00002"
      ]) {
        fireEvent.change(input, { target: { value: invalid } });
        expect(input).toHaveValue(invalid);
        expect(screen.getByText("标注只能输入数字")).toBeInTheDocument();
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(save).not.toHaveBeenCalled();
      }
      fireEvent.change(input, { target: { value: "0".repeat(21) } });
      expect(screen.getByText("标注最多 20 位数字")).toBeInTheDocument();
      expect(button).toBeDisabled();
      fireEvent.change(input, { target: { value: ` ${"0".repeat(20)} ` } });
      fireEvent.click(button);
      expect(save).toHaveBeenCalledWith({ a: "0".repeat(20) });
    }
  );

  it("仅直接共享原型判重，01和1不是同一标注", () => {
    const separate = [
      { dialect_scope: "uk", normalized_surface: "centre", entry_ids: ["a"] },
      { dialect_scope: "us", normalized_surface: "center", entry_ids: ["b"] }
    ];
    expect(
      annotationErrors(
        rows,
        { a: "01", b: "01", incoming: "1" },
        separate,
        true
      )
    ).toEqual({});
    expect(
      annotationErrors(
        rows,
        { a: "01", b: "01", incoming: " 01 " },
        separate,
        true
      )
    ).toEqual({
      a: "同组标注不能相同",
      b: "同组标注不能相同",
      incoming: "同组标注不能相同"
    });
  });

  it("历史中文不被静默改写，创建必须修正旧条；取消重开恢复历史值", () => {
    const historical = [
      { key: "a", label: "center", annotation: "中心" },
      rows[2]!
    ];
    const close = vi.fn();
    const save = vi.fn();
    const first = render(
      <EntryAnnotationModal
        rows={historical}
        groups={groups}
        creating
        onSave={save}
        onClose={close}
      />
    );
    expect(screen.getByLabelText("center标注")).toHaveValue("中心");
    fireEvent.change(screen.getByLabelText("新建词条标注"), {
      target: { value: "02" }
    });
    expect(screen.getByText("保存标注并创建").closest("button")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("center标注"), {
      target: { value: "01" }
    });
    expect(screen.getByText("保存标注并创建").closest("button")).toBeEnabled();
    fireEvent.click(screen.getByText(/取\s*消/));
    expect(close).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    first.unmount();
    render(
      <EntryAnnotationModal
        rows={historical}
        groups={groups}
        creating
        onSave={save}
        onClose={close}
      />
    );
    expect(screen.getByLabelText("center标注")).toHaveValue("中心");
  });

  it("只读行给出理由，且不假装还能输入", () => {
    render(
      <EntryAnnotationModal
        rows={[
          {
            key: "b",
            label: "center",
            annotation: null,
            readOnly: true,
            readOnlyHint: "他人词条"
          },
          rows[2]!
        ]}
        groups={groups}
        creating
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const readOnly = screen.getByLabelText("center标注");
    expect(readOnly).toBeDisabled();
    // 「请输入标注」挂在一个改不了的框上是误导。
    expect(readOnly).toHaveAttribute("placeholder", "未标注");
    expect(within(readOnly.closest("tr")!).getByText("他人词条")).toBeTruthy();
    expect(screen.getByLabelText("新建词条标注")).toHaveAttribute(
      "placeholder",
      "请输入标注"
    );
    // 只读行空着也不该挡住提交。
    fireEvent.change(screen.getByLabelText("新建词条标注"), {
      target: { value: "02" }
    });
    expect(screen.getByText("保存标注并创建").closest("button")).toBeEnabled();
  });

  it("独立编辑保留可空规则，只读历史中文或空值不阻断数字目标", () => {
    const readonly = { ...rows[1]!, annotation: "历史中文", readOnly: true };
    const save = vi.fn();
    const first = render(
      <EntryAnnotationModal
        rows={[rows[0]!, readonly]}
        groups={groups}
        onSave={save}
        onClose={vi.fn()}
      />
    );
    expect(screen.getAllByLabelText("center标注")[1]).toHaveValue("历史中文");
    expect(screen.getAllByLabelText("center标注")[1]).toBeDisabled();
    fireEvent.click(screen.getByText("保存标注"));
    expect(save).toHaveBeenCalledWith({ a: "01", b: "历史中文" });
    expect(
      annotationErrors([rows[0]!, readonly], { a: "01", b: "" }, groups, true)
    ).toEqual({});
    expect(
      annotationErrors([rows[0]!, readonly], { a: "01", b: "01" }, groups, true)
    ).toEqual({ a: "同组标注不能相同" });
    first.unmount();
    render(
      <EntryAnnotationModal
        rows={[rows[0]!]}
        groups={[]}
        onSave={save}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("center标注"), {
      target: { value: " " }
    });
    fireEvent.click(screen.getByText("保存标注"));
    expect(save).toHaveBeenLastCalledWith({ a: "" });
  });
});
