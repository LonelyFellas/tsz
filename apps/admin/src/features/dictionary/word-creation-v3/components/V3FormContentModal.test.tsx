import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { describe, expect, it, vi } from "vitest";
import type {
  DraftFormsStepContentV3,
  SharedFormsStepContentV3
} from "@tsz/types";
import { V3FormContentModal } from "./V3FormContentModal";
import { applyFormsStructure, expandFormContents } from "../sharedFormsModel";
import { createStableVariantIdFactory } from "../operations";
import { commonFormFixture, formsFixture, uuidFromInt } from "../fixtures";

// 宿主测试只替换重型语音编辑器，嵌套弹窗和本地草稿使用真实实现。
vi.mock("./V3ConcreteFormRow", () => ({
  V3ConcreteFormRow: ({
    content,
    onChange
  }: {
    content: DraftFormsStepContentV3;
    onChange: (next: DraftFormsStepContentV3) => void;
  }) => {
    const regions = content.pos[0]!.forms[0]!.regional_variants;
    return (
      <input
        aria-label="内容拼写"
        value={regions.mode === "common" ? regions.common.spelling : ""}
        onChange={(event) => {
          const next = structuredClone(content);
          const target = next.pos[0]!.forms[0]!.regional_variants;
          if (target.mode === "common")
            target.common.spelling = event.target.value;
          onChange(next);
        }}
      />
    );
  }
}));

function setup({ multipleGroups = false } = {}) {
  const expanded = formsFixture({
    forms: [
      commonFormFixture(),
      commonFormFixture({ id: uuidFromInt(901), form_type: "plural" })
    ]
  });
  const forms = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    expanded
  ) as SharedFormsStepContentV3;
  if (multipleGroups) {
    forms.pos[0]!.form_groups.push({
      id: uuidFromInt(902),
      scope: "general",
      is_regular: true,
      members: []
    });
  }
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <ConfigProvider virtual={false} theme={{ token: { motion: false } }}>
        <App>
          {open && (
            <V3FormContentModal
              forms={forms}
              formId={forms.pos[0]!.forms[1]!.id}
              catalog={[]}
              issues={[]}
              stableVariantIds={createStableVariantIdFactory(
                expandFormContents(forms),
                []
              )}
              retiredContentSlots={[]}
              onConfirm={(next) => {
                onConfirm(next);
                setOpen(false);
              }}
              onCancel={() => {
                onCancel();
                setOpen(false);
              }}
            />
          )}
        </App>
      </ConfigProvider>
    );
  }
  render(<Host />);
  return { forms, onConfirm, onCancel };
}

describe("词形内容弹窗的草稿边界", () => {
  it("编辑只保存在局部，确认才应用到页面草稿", () => {
    const { forms, onConfirm } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "内容拼写" }), {
      target: { value: "changed" }
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(JSON.stringify(forms)).not.toContain("changed");
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onConfirm.mock.calls[0]![0])).toContain("changed");
  });

  it("取消后选择放弃，不泄漏内容或标签修改", async () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "内容拼写" }), {
      target: { value: "discarded" }
    });
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("连续关闭请求复用一个离开确认", async () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "内容拼写" }), {
      target: { value: "discarded" }
    });
    const cancel = screen.getByRole("button", { name: /取\s*消/ });
    fireEvent.click(cancel);
    fireEvent.click(cancel);
    expect(
      await screen.findAllByRole("button", { name: "放弃修改" })
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => {
      const remaining = screen.queryByRole("button", { name: "放弃修改" });
      expect(remaining).not.toBeInTheDocument();
    });
  });

  it("多个变化组必须显式选择，标签确认仍只写入弹窗草稿", async () => {
    const { forms, onConfirm } = setup({ multipleGroups: true });
    fireEvent.click(screen.getByRole("button", { name: "指派标签" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "指派词性" }));
    fireEvent.click(await screen.findByRole("option", { name: "名词" }));
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    await waitFor(() =>
      expect(screen.getByText("请选择词性、变化组和词形类型")).toBeVisible()
    );
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "指派变化组" }));
    fireEvent.click(await screen.findByRole("option", { name: "第 2 组" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "指派词形类型" }));
    fireEvent.click(await screen.findByRole("option", { name: "原形" }));
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole("combobox", { name: "指派词性" })
      ).not.toBeInTheDocument()
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(forms.pos[0]!.form_groups[1]!.members).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    const added = next.pos[0]!.forms.find((binding) =>
      next.pos[0]!.form_groups[1]!.members.some(
        (member) => member.form_id === binding.id
      )
    )!;
    expect(added.form_type).toBe("base");
    expect(added.content_id).toBe(forms.pos[0]!.forms[1]!.content_id);
    expect(added.id).not.toBe(forms.pos[0]!.forms[1]!.id);
  });

  it("删除最后标签仍留在弹窗，取消可放弃整个删除", async () => {
    const { forms, onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^移除.*标签$/ }));
    const title = (await screen.findAllByText("删除这份词形内容？"))[0]!;
    const confirm = title.closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(confirm).getByRole("button", { name: "删除内容" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^移除.*标签$/ })
      ).not.toBeInTheDocument()
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(forms.contents).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
