import { useState } from "react";
import {
  act,
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
  assignSharedFormContent,
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
  editFormId,
  contentReassignmentAvailable = true,
  savedContentIds
}: {
  multipleGroups?: boolean;
  serverFieldOrder?: boolean;
  multiplePos?: boolean;
  baseOnly?: boolean;
  initialForms?: SharedFormsStepContentV3;
  editFormId?: string;
  contentReassignmentAvailable?: boolean;
  savedContentIds?: ReadonlySet<string>;
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
  let leaveGuard: (() => Promise<boolean>) | undefined;
  const registerLeaveGuard = (guard?: () => Promise<boolean>) => {
    leaveGuard = guard;
  };
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <ConfigProvider virtual={false} theme={{ token: { motion: false } }}>
        <App>
          {open && (
            <V3FormContentModal
              forms={forms}
              contentReassignmentAvailable={contentReassignmentAvailable}
              savedContentIds={savedContentIds}
              formId={editFormId ?? forms.pos[0]!.forms[baseOnly ? 0 : 1]!.id}
              issues={[]}
              stableVariantIds={createStableVariantIdFactory(
                expandFormContents(forms),
                []
              )}
              retiredContentSlots={[]}
              registerLeaveGuard={registerLeaveGuard}
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
  return { forms, onConfirm, onCancel, leave: () => leaveGuard!() };
}

describe("词形内容弹窗的草稿边界", () => {
  it("统一修改规则变化只应用到当前内容的全部标签和英美侧", () => {
    const expanded = formsFixture({
      forms: [
        ukUsFormFixture(),
        commonFormFixture({ id: uuidFromInt(901) }),
        commonFormFixture({ id: uuidFromInt(902), form_type: "plural" })
      ]
    });
    let initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const ids = createStableVariantIdFactory(expanded, []);
    initial = assignSharedFormContent(
      initial,
      initial.contents[0]!.id,
      initial.pos[0]!.forms[2]!.id,
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
    const regularity = screen.getByRole("radiogroup", {
      name: "是否规则变化"
    });
    expect(
      within(regularity)
        .getAllByRole("radio")
        .every((input) => !(input as HTMLInputElement).checked)
    ).toBe(true);
    fireEvent.click(within(regularity).getByRole("radio", { name: "否" }));
    expect(forms).toEqual(initial);
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    for (const binding of next.pos[0]!.forms.filter(
      (row) => row.content_id === initial.contents[0]!.id
    )) {
      expect(binding.regional_bindings).toMatchObject({
        uk: { is_regular: false },
        us: { is_regular: false }
      });
    }
    expect(next.pos[0]!.forms[1]).toEqual(initial.pos[0]!.forms[1]);
  });

  it("指派动词原形替换已有内容，保留词形数量、身份和组内顺序", async () => {
    const { forms, onConfirm } = setup({ baseOnly: true, multiplePos: true });
    const before = structuredClone(forms);
    fireEvent.change(screen.getByRole("textbox", { name: "内容拼写" }), {
      target: { value: "graph" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(picker).getByRole("checkbox", { name: "动词原形" }));
    expect(within(picker).getByRole("alert")).toHaveTextContent(
      "以下词形的拼写与发音将被替换"
    );
    expect(forms).toEqual(before);
    fireEvent.click(within(picker).getByRole("button", { name: "确认替换" }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    expect(next.pos[1]!.forms).toHaveLength(1);
    expect(next.pos[1]!.forms[0]).toMatchObject({
      id: before.pos[1]!.forms[0]!.id,
      form_type: "base",
      content_id: before.pos[0]!.forms[0]!.content_id
    });
    expect(next.pos.map((pos) => pos.form_groups)).toEqual(
      before.pos.map((pos) => pos.form_groups)
    );
    const expanded = expandFormContents(next);
    for (const pos of expanded.pos) {
      const regions = pos.forms[0]!.regional_variants;
      expect(regions).toMatchObject({
        mode: "common",
        common: { spelling: "graph" }
      });
    }
    expect(next.contents).toHaveLength(1);
  });

  it("替换内容保留目标词形自己的规则变化设置", async () => {
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
    fireEvent.click(within(picker).getByRole("button", { name: "确认替换" }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    expect(next.pos[0]!.forms).toHaveLength(2);
    expect(next.pos[0]!.forms[0]!.content_id).toBe(
      forms.pos[0]!.forms[1]!.content_id
    );
    expect(next.pos[0]!.forms[0]!.regional_bindings).toMatchObject({
      common: { is_regular: true }
    });
    expect(next.pos[0]!.forms[1]!.regional_bindings).toMatchObject({
      common: { is_regular: false }
    });
  });

  it("指派中不能取消既有原形并隐式删除词形", async () => {
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
    const checkbox = within(picker).getByRole("checkbox", {
      name: "名词原形 1（A）"
    });
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    fireEvent.click(within(picker).getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(onConfirm.mock.calls[0]![0]).toEqual(initial);
  });

  it("多个原形按序号分别选择，取消新勾选会还原被替换内容", async () => {
    const expanded = formsFixture({
      forms: [
        commonFormFixture({ spelling: "graph", form_type: "plural" }),
        commonFormFixture({ id: uuidFromInt(901), spelling: "job" }),
        commonFormFixture({ id: uuidFromInt(902), spelling: "jab" })
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
    const first = within(picker).getByRole("checkbox", {
      name: "名词原形 1（job）"
    });
    const second = within(picker).getByRole("checkbox", {
      name: "名词原形 2（jab）"
    });
    fireEvent.click(second);
    expect(first).not.toBeChecked();
    expect(first).toBeDisabled();
    fireEvent.click(second);
    expect(first).toBeEnabled();
    expect(within(picker).queryByRole("alert")).toBeNull();
    fireEvent.click(first);
    fireEvent.click(within(picker).getByRole("button", { name: "确认替换" }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    expect(next.pos[0]!.forms).toHaveLength(3);
    expect(next.pos[0]!.forms[1]!.content_id).toBe(initial.contents[0]!.id);
    expect(next.pos[0]!.forms[2]).toEqual(initial.pos[0]!.forms[2]);
    expect(
      next.contents.find((row) => row.id === initial.contents[2]!.id)
    ).toEqual(initial.contents[2]);
    expect(next.pos[0]!.form_groups).toEqual(initial.pos[0]!.form_groups);
  });

  it("取消刚选中的替换恢复全部内容，确认替换后放弃抽屉也不改页面草稿", async () => {
    const { forms, onConfirm, onCancel } = setup({
      baseOnly: true,
      multiplePos: true
    });
    const before = structuredClone(forms);
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    let picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    const target = within(picker).getByRole("checkbox", { name: "动词原形" });
    fireEvent.click(target);
    fireEvent.click(target);
    fireEvent.click(within(picker).getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    expect(screen.queryByText("动词原形")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(picker).getByRole("checkbox", { name: "动词原形" }));
    fireEvent.click(within(picker).getByRole("button", { name: "确认替换" }));
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^取\s*消$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(forms).toEqual(before);
  });

  it("未保存的新内容先保存再指派，不发送后端尚未登记的内容", () => {
    setup({ baseOnly: true, multiplePos: true, savedContentIds: new Set() });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    expect(within(picker).getByRole("alert")).toHaveTextContent(
      "请先确认当前内容并保存草稿"
    );
    expect(
      within(picker).getByRole("checkbox", { name: "动词原形" })
    ).toBeDisabled();
  });

  it.each([false, true])(
    "未确认指派触发离开保护并应用全部选择，正文已修改=%s",
    async (editContent) => {
      const { forms, onConfirm, onCancel, leave } = setup({
        baseOnly: true,
        multiplePos: true
      });
      if (editContent)
        fireEvent.change(screen.getByRole("textbox", { name: "内容拼写" }), {
          target: { value: "changed" }
        });
      fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
      const picker = screen
        .getByText(/这种拼写形式 指派词形标签$/)
        .closest('[role="dialog"]') as HTMLElement;
      fireEvent.click(
        within(picker).getByRole("checkbox", { name: "动词原形" })
      );
      let pending!: Promise<boolean>;
      act(() => {
        pending = leave();
      });
      expect(onCancel).not.toHaveBeenCalled();
      const prompt = screen
        .getByText("词形内容尚未应用")
        .closest('[role="dialog"]') as HTMLElement;
      await waitFor(() =>
        expect(within(prompt).getByText(/动词/)).toBeVisible()
      );
      fireEvent.click(
        within(prompt).getByRole("button", { name: "应用并离开" })
      );
      await expect(pending).resolves.toBe(true);
      const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
      expect(next.pos[1]!.forms).toHaveLength(1);
      expect(next.pos[1]!.forms[0]!.content_id).toBe(
        forms.pos[0]!.forms[0]!.content_id
      );
      if (editContent) expect(JSON.stringify(next)).toContain("changed");
    }
  );

  it("待确认选择离开时继续编辑保留选择，放弃后不改变草稿", async () => {
    const { forms, onConfirm, onCancel, leave } = setup({
      baseOnly: true,
      multiplePos: true
    });
    const before = structuredClone(forms);
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(picker).getByRole("checkbox", { name: "动词原形" }));
    let pending!: Promise<boolean>;
    act(() => {
      pending = leave();
    });
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    await expect(pending).resolves.toBe(false);
    expect(
      within(picker).getByRole("checkbox", { name: "动词原形" })
    ).toBeChecked();
    act(() => {
      pending = leave();
    });
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    await expect(pending).resolves.toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(forms).toEqual(before);
  });

  it("旧服务不允许替换已有词形，既有标签仍可查看", () => {
    const { onConfirm } = setup({
      baseOnly: true,
      multiplePos: true,
      contentReassignmentAvailable: false
    });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const picker = screen
      .getByText(/这种拼写形式 指派词形标签$/)
      .closest('[role="dialog"]') as HTMLElement;
    expect(
      within(picker).getByRole("checkbox", { name: "动词原形" })
    ).toBeDisabled();
    expect(
      within(picker).getByRole("checkbox", { name: "名词原形" })
    ).toBeChecked();
    expect(onConfirm).not.toHaveBeenCalled();
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
    fireEvent.click(within(picker).getByRole("button", { name: "确认替换" }));
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
    const added = next.pos[0]!.forms[0]!;
    expect(next.pos.map((pos) => pos.forms.map((row) => row.id))).toEqual(
      forms.pos.map((pos) => pos.forms.map((row) => row.id))
    );
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
    expect(next.pos.map((pos) => pos.form_groups)).toEqual(
      forms.pos.map((pos) => pos.form_groups)
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
