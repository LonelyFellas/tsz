import { primaryRegionalVariant } from "@tsz/shared";
import {
  VoiceSaveContext,
  useVoiceAudioTasks,
  useVoiceSave
} from "../voiceSaveContext";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DraftFormsStepContentV3,
  SharedFormsStepContentV3
} from "@tsz/types";
import { V3FormContentModal } from "./V3FormContentModal";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import {
  assignSharedFormContent,
  applyFormsStructure,
  expandFormContents
} from "../sharedFormsModel";
import { createStableVariantIdFactory } from "../operations";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt
} from "../fixtures";

const backgroundAudio = vi.hoisted(() => ({
  enabled: false,
  finish: (() => {}) as (ready?: boolean) => void
}));
beforeEach(() => {
  backgroundAudio.enabled = false;
});
// 宿主测试只替换重型语音编辑器，嵌套弹窗和本地草稿使用真实实现。
vi.mock("./V3ConcreteFormRow", () => ({
  V3ConcreteFormRow: ({
    content,
    onChange,
    dialectActions
  }: {
    content: DraftFormsStepContentV3;
    onChange: (next: DraftFormsStepContentV3) => void;
    dialectActions?: Partial<Record<"uk" | "us", ReactNode>>;
  }) => {
    const localSave = useVoiceSave();
    const audioTasks = useVoiceAudioTasks();
    const latest = useRef({ content, onChange });
    latest.current = { content, onChange };
    useEffect(() => {
      if (!backgroundAudio.enabled || !audioTasks) return;
      const pending = new Promise<boolean>((resolve) => {
        backgroundAudio.finish = (ready = true) => {
          if (!ready) {
            resolve(false);
            return;
          }
          const next = structuredClone(latest.current.content);
          const regions = next.pos[0]!.forms[0]!.regional_variants;
          if (regions.mode !== "common")
            throw new Error("expected common fixture");
          regions.common.spelling_speech = {
            content: {
              version: 2,
              text: regions.common.spelling,
              annotations: []
            },
            voice_profile: {
              voices: [
                {
                  voice_id: "sonia",
                  enabled: true,
                  rate_percent: 0,
                  audio_asset_id: "formal-in-drawer"
                }
              ]
            }
          };
          flushSync(() => latest.current.onChange(next));
          resolve(true);
        };
      });
      audioTasks.set("drawer-background-audio", () => pending);
      return () => {
        audioTasks.delete("drawer-background-audio");
      };
    }, [audioTasks]);
    const regions = content.pos[0]!.forms[0]!.regional_variants;
    return (
      <>
        {dialectActions?.uk}
        {dialectActions?.us}
        {localSave && (
          <button onClick={() => void localSave.save("word")}>
            保存当前正文
          </button>
        )}
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
      </>
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
  savedContentIds,
  persist
}: {
  persist?: (value: SharedFormsStepContentV3) => Promise<boolean>;
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
    const [applied, setApplied] = useState(forms);
    return (
      <App>
        <VoiceSaveContext.Provider
          value={persist ? { save: () => persist(applied) } : null}
        >
          {open && (
            <V3FormContentModal
              forms={applied}
              onApply={setApplied}
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
        </VoiceSaveContext.Provider>
      </App>
    );
  }
  const { unmount } = render(<Host />);
  return { forms, onConfirm, onCancel, leave: () => leaveGuard!(), unmount };
}

it("切换语言保留抽屉未应用输入，显式确认前不写页面草稿", () => {
  const forms = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({ forms: [commonFormFixture()] })
  ) as SharedFormsStepContentV3;
  const formId = forms.pos[0]!.forms[0]!.id;
  const stableVariantIds = createStableVariantIdFactory(
    expandFormContents(forms),
    []
  );
  const onConfirm = vi.fn();
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const content = (locale: "zh-Hans" | "en-US") => (
    <InterfaceI18nProvider locale={locale}>
      <App>
        <V3FormContentModal
          forms={forms}
          formId={formId}
          issues={[]}
          stableVariantIds={stableVariantIds}
          retiredContentSlots={[]}
          onConfirm={onConfirm}
          onApply={onApply}
          onCancel={onCancel}
        />
      </App>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  const input = screen.getByRole("textbox", { name: "内容拼写" });
  fireEvent.change(input, { target: { value: "原文 centre" } });
  view.rerender(content("en-US"));
  expect(screen.getByRole("textbox", { name: "内容拼写" })).toBe(input);
  expect(input).toHaveValue("原文 centre");
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and apply to draft" })
  );
  expect(onConfirm).toHaveBeenCalledOnce();
  const saved = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
  expect(saved.pos[0]!.forms[0]!.id).toBe(formId);
  expect(saved.contents.map((item) => item.id)).toEqual(
    forms.contents.map((item) => item.id)
  );
  const variant = saved.contents[0]!.regional_variants;
  expect(variant.mode).toBe("common");
  if (variant.mode === "common")
    expect(variant.common.spelling).toBe("原文 centre");
  expect(onCancel).not.toHaveBeenCalled();
});

describe("词形内容弹窗的草稿边界", () => {
  it("收起后不提交或丢失输入，展开复用编辑器并应用草稿", async () => {
    const { onConfirm, onCancel } = setup();
    const input = screen.getByRole("textbox", { name: "内容拼写" });
    input.focus();
    fireEvent.change(input, { target: { value: "reference draft" } });
    const dialog = input.closest('[role="dialog"]')!;
    expect(dialog).toHaveAttribute("aria-modal", "false");
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("textbox", { name: "内容拼写" })).toBeNull();
    expect(input).toBeInTheDocument();
    expect(input.closest("[inert]")).toHaveAttribute("aria-hidden", "true");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByRole("textbox", { name: "内容拼写" })).toBe(input);
    expect(input).toHaveValue("reference draft");
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(JSON.stringify(onConfirm.mock.calls[0]![0])).toContain(
      "reference draft"
    );
  });

  it("收起期间语音任务继续完成，展开后应用包含语音结果", async () => {
    backgroundAudio.enabled = true;
    const { onConfirm } = setup();
    const input = screen.getByRole("textbox", { name: "内容拼写" });
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    await act(async () => backgroundAudio.finish());
    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByRole("textbox", { name: "内容拼写" })).toBe(input);
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(JSON.stringify(onConfirm.mock.calls[0]![0])).toContain(
      "formal-in-drawer"
    );
  });

  it("嵌套弹窗的 Escape 不关闭浮窗，外层关闭仍经过未保存提示", () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "内容拼写" }), {
      target: { value: "keep this draft" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新增标签" }));
    const nested = screen
      .getByText(/为.*指派词形标签/)
      .closest('[role="dialog"]')!;
    fireEvent.keyDown(nested, { key: "Escape", keyCode: 27 });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "内容拼写" })).toHaveValue(
      "keep this draft"
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭词形内容设置" }));
    expect(screen.getByText("词形内容尚未应用")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([
    ["unified", "unified", true],
    ["unified", "distinguish", false],
    ["distinguish", "distinguish", true]
  ] as const)(
    "已有设置 %s/%s/is_regular=%s 原样回显并确认，不套用默认值",
    (spelling_mode, phonetic_mode, is_regular) => {
      const expanded = formsFixture({
        forms: [
          spelling_mode === "distinguish"
            ? ukUsFormFixture()
            : commonFormFixture()
        ],
        dialect_rules: { spelling_mode, phonetic_mode }
      });
      const initial = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        expanded
      ) as SharedFormsStepContentV3;
      const regions = initial.pos[0]!.forms[0]!.regional_bindings;
      if (regions.mode === "common") regions.common.is_regular = is_regular;
      else {
        primaryRegionalVariant(regions, "uk").is_regular = is_regular;
        primaryRegionalVariant(regions, "us").is_regular = is_regular;
      }
      const { onConfirm } = setup({ initialForms: initial, baseOnly: true });
      expect(
        screen.getByRole("switch", { name: "拼写有英美区别" })
      ).toHaveAttribute(
        "aria-checked",
        String(spelling_mode === "distinguish")
      );
      expect(
        screen.getByRole("switch", { name: "音标有英美区别" })
      ).toHaveAttribute(
        "aria-checked",
        String(phonetic_mode === "distinguish")
      );
      expect(
        screen.getByRole("switch", { name: "词形不规则变化" })
      ).toHaveAttribute("aria-checked", String(!is_regular));
      fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
      expect(onConfirm).toHaveBeenCalledWith(initial);
    }
  );

  it("拼写开关联动音标，不规则开关双向映射，确认后重新打开回显", () => {
    const { forms, onConfirm, unmount } = setup({ baseOnly: true });
    const before = structuredClone(forms);
    const spelling = screen.getByRole("switch", { name: "拼写有英美区别" });
    const phonetics = screen.getByRole("switch", { name: "音标有英美区别" });
    const irregularity = screen.getByRole("switch", { name: "词形不规则变化" });
    expect(spelling).not.toBeChecked();
    expect(phonetics).not.toBeChecked();
    expect(irregularity).not.toBeChecked();
    fireEvent.click(spelling);
    expect(spelling).toBeChecked();
    expect(phonetics).toBeChecked();
    expect(phonetics).toBeDisabled();
    fireEvent.click(phonetics);
    expect(phonetics).toBeChecked();
    fireEvent.click(spelling);
    expect(spelling).not.toBeChecked();
    expect(phonetics).toBeChecked();
    expect(phonetics).toBeEnabled();
    fireEvent.click(phonetics);
    expect(phonetics).not.toBeChecked();
    fireEvent.click(phonetics);
    fireEvent.click(irregularity);
    expect(irregularity).toBeChecked();
    fireEvent.click(irregularity);
    expect(irregularity).not.toBeChecked();
    expect(forms).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    const next = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
    expect(next.contents[0]!.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "distinguish"
    });
    expect(next.pos[0]!.forms[0]!.regional_bindings).toMatchObject({
      uk: { is_regular: true },
      us: { is_regular: true }
    });
    unmount();
    setup({ initialForms: next, baseOnly: true });
    expect(
      screen.getByRole("switch", { name: "拼写有英美区别" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "音标有英美区别" })
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "词形不规则变化" })
    ).not.toBeChecked();
  });

  it.each([
    ["uk", false],
    ["us", false],
    ["us", true]
  ] as const)(
    "关闭拼写区别时显式选择 %s（同拼写=%s），保留所选拼写及两侧发音，确认后重开回显",
    (side, sameSpelling) => {
      const initial = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        formsFixture({
          forms: [
            ukUsFormFixture({
              us: {
                spelling: sameSpelling ? "centre" : "center",
                pronunciations: [
                  pronunciationFixture({
                    id: uuidFromInt(951),
                    actual_pron: "American pronunciation"
                  })
                ]
              }
            })
          ]
        })
      ) as SharedFormsStepContentV3;
      const regions = initial.contents[0]!.regional_variants;
      if (regions.mode !== "uk_us") throw new Error("fixture");
      regions.uk.spelling_rich = {
        version: 2,
        text: "centre",
        annotations: [{ type: "italic", start: 0, end: 1 }]
      };
      regions.us.spelling_speech = {
        content: { version: 2, text: regions.us.spelling, annotations: [] },
        voice_profile: { voices: [] }
      };
      const before = structuredClone(initial);
      const { onConfirm, unmount } = setup({
        initialForms: initial,
        baseOnly: true
      });
      const spelling = screen.getByRole("switch", { name: "拼写有英美区别" });
      fireEvent.click(spelling);
      const dialog = screen.getByRole("dialog", { name: "选择主拼写" });
      expect(spelling).toBeChecked();
      const confirm = within(dialog).getByRole("button", { name: "确认选择" });
      expect(confirm).toBeDisabled();
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: side === "uk" ? "采用英式内容" : "采用美式内容"
        })
      );
      expect(confirm).toHaveAccessibleName(
        side === "uk" ? "使用英式拼写" : "使用美式拼写"
      );
      fireEvent.click(confirm);
      expect(spelling).not.toBeChecked();
      expect(
        screen.getByRole("switch", { name: "音标有英美区别" })
      ).toBeChecked();
      expect(initial).toEqual(before);
      fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
      const saved = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
      const next = saved.contents[0]!.regional_variants;
      if (next.mode !== "uk_us")
        throw new Error("expected separate pronunciations");
      for (const target of ["uk", "us"] as const) {
        expect(next[target].spelling).toBe(regions[side].spelling);
        expect(next[target].spelling_rich).toEqual(regions[side].spelling_rich);
        expect(next[target].spelling_speech).toEqual(
          regions[side].spelling_speech
        );
        expect(next[target].id).toBe(regions[target].id);
        expect(next[target].pronunciations).toEqual(
          regions[target].pronunciations
        );
      }
      expect(saved.pos).toEqual(initial.pos);
      unmount();
      const reopened = setup({ initialForms: saved, baseOnly: true });
      expect(
        screen.getByRole("switch", { name: "拼写有英美区别" })
      ).not.toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
      expect(reopened.onConfirm).toHaveBeenCalledWith(saved);
    }
  );

  it("取消主拼写选择不更改开关或草稿，再次打开须重新选择", () => {
    const initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      formsFixture({ forms: [ukUsFormFixture()] })
    ) as SharedFormsStepContentV3;
    const { onConfirm } = setup({ initialForms: initial, baseOnly: true });
    const spelling = screen.getByRole("switch", { name: "拼写有英美区别" });
    fireEvent.click(spelling);
    let dialog = screen.getByRole("dialog", { name: "选择主拼写" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "采用英式内容" })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "取消统一" }));
    expect(spelling).toBeChecked();
    fireEvent.click(spelling);
    dialog = screen.getByRole("dialog", { name: "选择主拼写" });
    for (const name of ["采用英式内容", "采用美式内容"])
      expect(within(dialog).getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    expect(
      within(dialog).getByRole("button", { name: "确认选择" })
    ).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape", keyCode: 27 });
    expect(spelling).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(onConfirm).toHaveBeenCalledWith(initial);
  });

  it.each(["uk", "us"] as const)(
    "音标文字相同而配音配置不同，选择 %s 后统一发音并保留所选配置",
    (side) => {
      const initial = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        formsFixture({
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "distinguish"
          },
          forms: [ukUsFormFixture({ us: { spelling: "centre" } })]
        })
      ) as SharedFormsStepContentV3;
      const regions = initial.contents[0]!.regional_variants;
      if (regions.mode !== "uk_us") throw new Error("fixture");
      for (const dialect of ["uk", "us"] as const)
        regions[dialect].pronunciations[0]!.synthesis = {
          alphabet: "ipa",
          ipa: "",
          ups: "",
          [dialect]: {
            source: "ipa",
            ipa: dialect === "uk" ? "uk-ipa" : "us-ipa",
            ups: ""
          }
        };
      const before = structuredClone(initial);
      const { onConfirm, unmount } = setup({
        initialForms: initial,
        baseOnly: true
      });
      const phonetics = screen.getByRole("switch", { name: "音标有英美区别" });
      fireEvent.click(phonetics);
      const dialog = screen.getByRole("dialog", { name: "选择统一发音" });
      expect(phonetics).toBeChecked();
      expect(
        within(dialog).getByRole("button", { name: "确认选择" })
      ).toBeDisabled();
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: side === "uk" ? "采用英式内容" : "采用美式内容"
        })
      );
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: side === "uk" ? "使用英式发音" : "使用美式发音"
        })
      );
      expect(phonetics).not.toBeChecked();
      expect(initial).toEqual(before);
      fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
      const saved = onConfirm.mock.calls[0]![0] as SharedFormsStepContentV3;
      const common = saved.contents[0]!.regional_variants;
      if (common.mode !== "common") throw new Error("expected common");
      const { id: _id, ...value } = common.common.pronunciations[0]!;
      const { id: _sourceId, ...source } = regions[side].pronunciations[0]!;
      expect(value).toEqual(source);
      expect(common.common.spelling).toBe("centre");
      unmount();
      const reopened = setup({ initialForms: saved, baseOnly: true });
      expect(
        screen.getByRole("switch", { name: "音标有英美区别" })
      ).not.toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
      expect(reopened.onConfirm).toHaveBeenCalledWith(saved);
    }
  );

  it("取消统一发音选择，原值和旧数据保持不变", () => {
    const expanded = formsFixture({
      dialect_rules: { spelling_mode: "unified", phonetic_mode: "distinguish" },
      forms: [
        ukUsFormFixture({
          us: {
            spelling: "centre",
            pronunciations: [
              pronunciationFixture({
                id: uuidFromInt(951),
                actual_pron: "different"
              })
            ]
          }
        })
      ]
    });
    const initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const { onConfirm } = setup({ initialForms: initial, baseOnly: true });
    fireEvent.click(screen.getByRole("switch", { name: "音标有英美区别" }));
    const dialog = screen.getByRole("dialog", { name: "选择统一发音" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "采用英式内容" })
    );
    fireEvent.keyDown(dialog, { key: "Escape", keyCode: 27 });
    expect(
      screen.getByRole("switch", { name: "拼写有英美区别" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "音标有英美区别" })
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(onConfirm).toHaveBeenCalledWith(initial);
  });

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
    primaryRegionalVariant(regions, "uk").is_regular = false;
    primaryRegionalVariant(regions, "us").is_regular = true;
    const untouched = setup({ initialForms: initial, baseOnly: true });
    expect(
      screen.getByRole("switch", { name: "词形不规则变化" })
    ).toHaveTextContent("未统一");
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    expect(untouched.onConfirm).toHaveBeenCalledWith(initial);
    untouched.unmount();
    const { forms, onConfirm } = setup({
      initialForms: initial,
      editFormId: initial.pos[0]!.forms[0]!.id
    });
    const regularity = screen.getByRole("switch", {
      name: "词形不规则变化"
    });
    expect(regularity).toHaveAccessibleDescription("各标签设置不同");
    expect(regularity).toHaveTextContent("未统一");
    fireEvent.click(regularity);
    expect(regularity).toBeChecked();
    expect(screen.queryByText("各标签设置不同")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("switch", { name: "词形不规则变化" }));
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
    fireEvent.click(screen.getByRole("switch", { name: "词形不规则变化" }));
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

it("局部保存先交接完整抽屉结果再请求业务保存，失败不关闭并保留其他词形", async () => {
  const persist = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const { forms, onConfirm } = setup({ persist });
  const other = structuredClone(forms.contents[0]);
  fireEvent.change(screen.getByLabelText("内容拼写"), {
    target: { value: "atomic draft" }
  });
  fireEvent.click(screen.getByText("保存当前正文"));
  await waitFor(() => expect(persist).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("内容拼写")).toHaveValue("atomic draft");
  expect(onConfirm).not.toHaveBeenCalled();
  expect(persist.mock.calls[0]![0].contents[0]).toEqual(other);
  const edited = persist.mock.calls[0]![0].contents[1]!.regional_variants;
  expect(edited.mode === "common" && edited.common.spelling).toBe(
    "atomic draft"
  );
  fireEvent.click(screen.getByText("保存当前正文"));
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
  expect(persist.mock.calls[1]![0]).toEqual(persist.mock.calls[0]![0]);
  expect(onConfirm).not.toHaveBeenCalled();
});

it.each([true, false])(
  "弹窗先等待全部内部音频再读取最新草稿（业务保存=%s）",
  async (persisted) => {
    backgroundAudio.enabled = true;
    const persist = vi.fn(async (_forms: SharedFormsStepContentV3) => true);
    const { onConfirm } = setup({ persist: persisted ? persist : undefined });
    const apply = screen.getByRole("button", { name: "确认，应用到草稿" });
    fireEvent.click(
      screen.getByRole("button", {
        name: persisted ? "保存当前正文" : "确认，应用到草稿"
      })
    );
    expect(persist).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(apply).toHaveAttribute("aria-busy", "true");
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    await act(async () => backgroundAudio.finish());
    await waitFor(() =>
      expect(persisted ? persist : onConfirm).toHaveBeenCalledOnce()
    );
    const result = persisted
      ? persist.mock.calls[0]![0]
      : onConfirm.mock.calls[0]![0];
    expect(JSON.stringify(result)).toContain("formal-in-drawer");
    if (persisted) {
      expect(apply).not.toHaveAttribute("aria-busy", "true");
      expect(apply).toBeEnabled();
    }
  }
);

it("音频生成失败后停止应用按钮的 loading，保留输入和弹窗", async () => {
  backgroundAudio.enabled = true;
  const { onConfirm } = setup();
  fireEvent.change(screen.getByLabelText("内容拼写"), {
    target: { value: "retained input" }
  });
  const apply = screen.getByRole("button", { name: "确认，应用到草稿" });
  fireEvent.click(apply);
  expect(apply).toHaveAttribute("aria-busy", "true");
  await act(async () => backgroundAudio.finish(false));
  expect(apply).not.toHaveAttribute("aria-busy", "true");
  expect(apply).toBeEnabled();
  expect(screen.getByLabelText("内容拼写")).toHaveValue("retained input");
  expect(onConfirm).not.toHaveBeenCalled();
});
