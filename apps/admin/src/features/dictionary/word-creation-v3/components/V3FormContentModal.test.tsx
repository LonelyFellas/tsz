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
import {
  addSharedLabel,
  applyFormsStructure,
  expandFormContents
} from "../sharedFormsModel";
import { createStableVariantIdFactory } from "../operations";
import {
  commonFormFixture,
  formsFixture,
  ukUsFormFixture,
  uuidFromInt
} from "../fixtures";

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

function setup({
  multipleGroups = false,
  serverFieldOrder = false,
  multiplePos = false,
  baseOnly = false,
  initialForms,
  editFormId
}: {
  multipleGroups?: boolean;
  serverFieldOrder?: boolean;
  multiplePos?: boolean;
  baseOnly?: boolean;
  initialForms?: SharedFormsStepContentV3;
  editFormId?: string;
} = {}) {
  const expanded = formsFixture({
    forms: [
      commonFormFixture(),
      ...(!baseOnly
        ? [commonFormFixture({ id: uuidFromInt(901), form_type: "plural" })]
        : [])
    ]
  });
  if (multiplePos) {
    expanded.pos.push(
      ...formsFixture({
        pos_id: uuidFromInt(910),
        pos: "verb",
        forms: [commonFormFixture({ id: uuidFromInt(911) })],
        groups: [
          {
            id: uuidFromInt(912),
            is_regular: true,
            members: [{ id: uuidFromInt(913), form_id: uuidFromInt(911) }]
          }
        ]
      }).pos
    );
  }
  const forms =
    initialForms ??
    (applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3);
  if (serverFieldOrder) {
    const content = forms.contents[1]!;
    if (content.regional_variants.mode !== "common") throw new Error("fixture");
    const { id, ...variant } = content.regional_variants.common;
    content.regional_variants.common = { ...variant, id };
  }
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
              formId={editFormId ?? forms.pos[0]!.forms[baseOnly ? 0 : 1]!.id}
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
  it("按标签及英美侧修改规则变化不会覆盖其他绑定", () => {
    const expanded = formsFixture({ forms: [ukUsFormFixture()] });
    let initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const ids = createStableVariantIdFactory(expanded, []);
    initial = addSharedLabel(
      initial,
      initial.contents[0]!.id,
      initial.pos[0]!.pos_id,
      initial.pos[0]!.form_groups[0]!.id,
      "plural",
      ids
    );
    const regions = initial.pos[0]!.forms[0]!.regional_bindings;
    if (regions.mode !== "uk_us") throw new Error("fixture");
    regions.uk.is_regular = false;
    regions.us.is_regular = true;
    const { forms, onConfirm } = setup({
      initialForms: initial,
      editFormId: initial.pos[0]!.forms[0]!.id
    });
    fireEvent.click(screen.getByRole("button", { name: "分别设置规则变化" }));
    const uk = screen.getByRole("radiogroup", {
      name: "名词第 1 组原形英式是否规则变化"
    });
    expect(within(uk).getByRole("radio", { name: "否" })).toBeChecked();
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", {
          name: "名词第 1 组复数美式是否规则变化"
        })
      ).getByRole("radio", { name: "否" })
    );
    expect(forms).toEqual(initial);
    expect(
      within(screen.getByRole("radiogroup", { name: "是否规则变化" }))
        .getAllByRole("radio")
        .every((input) => !(input as HTMLInputElement).checked)
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    expect(next.pos[0]!.forms[0]!.regional_bindings).toEqual(
      initial.pos[0]!.forms[0]!.regional_bindings
    );
    expect(next.pos[0]!.forms[1]!.regional_bindings).toMatchObject({
      uk: { is_regular: true },
      us: { is_regular: false }
    });
  });

  it("先设为不规则再新增标签会继承当前设置", async () => {
    const { forms, onConfirm } = setup();
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "是否规则变化" })
      ).getByRole("radio", { name: "否" })
    );
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(picker).getByRole("checkbox", { name: "名词原形" }));
    fireEvent.click(within(picker).getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    expect(
      within(
        screen.getByRole("radiogroup", { name: "是否规则变化" })
      ).getByRole("radio", { name: "否" })
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    const contentId = forms.pos[0]!.forms[1]!.content_id;
    for (const binding of next.pos[0]!.forms.filter(
      (row) => row.content_id === contentId
    )) {
      expect(binding.regional_bindings).toMatchObject({
        common: { is_regular: false }
      });
    }
  });

  it("首个原形取消勾选再恢复不改变词形和组成员顺序", async () => {
    const expanded = formsFixture({
      forms: [
        commonFormFixture({ spelling: "A" }),
        commonFormFixture({ id: uuidFromInt(901), spelling: "B" })
      ]
    });
    const initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const { onConfirm } = setup({
      initialForms: initial,
      editFormId: initial.pos[0]!.forms[0]!.id
    });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    const checkbox = within(picker).getByRole("checkbox", { name: "名词原形" });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    fireEvent.click(within(picker).getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(onConfirm.mock.calls[0]![0]).toEqual(initial);
  });

  it("标签候选只展示外层已添加的词形，不补齐目录类型或空组", () => {
    setup({ baseOnly: true, multiplePos: true, multipleGroups: true });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    expect(
      within(picker)
        .getAllByRole("checkbox")
        .map((input) => input.getAttribute("aria-label"))
    ).toEqual(["名词第 1 组原形", "动词原形"]);
    expect(within(picker).queryByText("复数")).not.toBeInTheDocument();
    expect(within(picker).queryByText("第 2 组")).not.toBeInTheDocument();
  });

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

  it("服务端 JSON 字段顺序不同时，未编辑可直接取消", () => {
    const { onConfirm, onCancel } = setup({ serverFieldOrder: true });
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "放弃修改" })
    ).not.toBeInTheDocument();
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

  it("按词性分列多选，多个变化组的选择只应用到指定组", async () => {
    const { forms, onConfirm } = setup({
      multipleGroups: true,
      multiplePos: true
    });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    expect(within(picker).queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      within(picker).getByRole("checkbox", { name: "名词第 1 组复数" })
    ).toBeChecked();
    expect(within(picker).queryByText("第 2 组")).not.toBeInTheDocument();
    fireEvent.click(
      within(picker).getByRole("checkbox", { name: "名词第 1 组原形" })
    );
    fireEvent.click(within(picker).getByRole("checkbox", { name: "动词原形" }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(picker).getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(forms.pos[0]!.form_groups[1]!.members).toHaveLength(0);
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "是否规则变化" })
      ).getByRole("radio", { name: /^否$/ })
    );
    expect(forms.pos[0]!.forms[1]!.regional_bindings).toMatchObject({
      common: { is_regular: true }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    const added = next.pos[0]!.forms.find(
      (binding) =>
        binding.id !== forms.pos[0]!.forms[0]!.id &&
        binding.form_type === "base" &&
        binding.content_id === forms.pos[0]!.forms[1]!.content_id
    )!;
    expect(next.pos[0]!.form_groups[1]!.members).toHaveLength(0);
    expect(added.form_type).toBe("base");
    expect(added.content_id).toBe(forms.pos[0]!.forms[1]!.content_id);
    expect(added.id).not.toBe(forms.pos[0]!.forms[1]!.id);
    expect(
      next.pos[1]!.forms.filter(
        (binding) => binding.content_id === added.content_id
      ).map((binding) => binding.form_type)
    ).toEqual(["base"]);
    for (const binding of next.pos
      .flatMap((pos) => pos.forms)
      .filter((binding) => binding.content_id === added.content_id)) {
      expect(binding.regional_bindings).toMatchObject({
        common: { is_regular: false }
      });
    }
    expect(next.pos[0]!.forms[0]!.regional_bindings).toEqual(
      forms.pos[0]!.forms[0]!.regional_bindings
    );
  });

  it("取消标签多选不修改草稿，取消勾选后恢复保留原身份", async () => {
    const { forms, onConfirm } = setup({ multipleGroups: true });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    let picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    const original = within(picker).getByRole("checkbox", {
      name: "名词第 1 组复数"
    });
    fireEvent.click(original);
    fireEvent.click(original);
    fireEvent.click(
      within(picker).getByRole("checkbox", { name: "名词第 1 组原形" })
    );
    fireEvent.click(within(picker).getByRole("button", { name: /取\s*消/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    expect(
      within(picker).getByRole("checkbox", { name: "名词第 1 组原形" })
    ).not.toBeChecked();
    const restored = within(picker).getByRole("checkbox", {
      name: "名词第 1 组复数"
    });
    fireEvent.click(restored);
    fireEvent.click(restored);
    fireEvent.click(within(picker).getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(onConfirm.mock.calls[0]![0]).toEqual(forms);
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
