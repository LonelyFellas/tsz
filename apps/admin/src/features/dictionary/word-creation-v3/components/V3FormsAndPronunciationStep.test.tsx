import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordFormGroupV3
} from "@tsz/types";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt,
  uuidSequence
} from "../fixtures";
import { validateFormsContent } from "../model";
import { partOfSpeechCatalogFixture } from "../../word-creation/partOfSpeech.test.helper";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";
import { V3FormGroupCard } from "./V3FormGroupCard";
import { V3FormsAndPronunciationStep } from "./V3FormsAndPronunciationStep";
import { V3PosTab } from "./V3PosTab";
import { V3PronunciationList } from "./V3PronunciationList";

const catalogState = vi.hoisted(() => ({
  data: undefined as typeof partOfSpeechCatalogFixture | undefined,
  isError: false,
  pending: undefined as Promise<typeof partOfSpeechCatalogFixture> | undefined
}));

vi.mock("../../dataSource", () => ({
  partOfSpeechDataSource: {
    catalog: () =>
      catalogState.pending ??
      (catalogState.isError
        ? Promise.reject(new Error("catalog unavailable"))
        : Promise.resolve(
            catalogState.data ?? { catalog_version: 1, items: [] }
          ))
  }
}));

function group(
  id: string,
  members: Array<{ id: string; form_id: string }>
): WordFormGroupV3 {
  return { id, is_regular: true, members };
}

function multiPosFixture(): DraftFormsStepContentV3 {
  const shared = commonFormFixture({
    id: uuidFromInt(101),
    variant_id: uuidFromInt(201),
    spelling: "shared-base"
  });
  const secondBase = commonFormFixture({
    id: uuidFromInt(102),
    variant_id: uuidFromInt(202),
    spelling: "second-base"
  });
  const verb = commonFormFixture({
    id: uuidFromInt(103),
    variant_id: uuidFromInt(203),
    spelling: "verb-base"
  });
  return {
    pos: [
      {
        pos_id: uuidFromInt(1),
        pos: "noun",
        forms: [shared, secondBase],
        form_groups: [
          group(uuidFromInt(11), [
            { id: uuidFromInt(21), form_id: shared.id },
            { id: uuidFromInt(22), form_id: secondBase.id }
          ]),
          group(uuidFromInt(12), [{ id: uuidFromInt(23), form_id: shared.id }])
        ]
      },
      {
        pos_id: uuidFromInt(2),
        pos: "verb",
        forms: [verb],
        form_groups: [
          group(uuidFromInt(13), [{ id: uuidFromInt(24), form_id: verb.id }])
        ]
      }
    ]
  };
}

function Harness({
  initial,
  issues = [],
  idFactory
}: {
  initial: DraftFormsStepContentV3;
  issues?: V3DraftValidationIssue[];
  idFactory?: () => string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AntApp>
      <V3FormsAndPronunciationStep
        value={value}
        onChange={setValue}
        issues={issues}
        idFactory={idFactory}
      />
      <output data-testid="canonical-value">{JSON.stringify(value)}</output>
    </AntApp>
  );
}

function DeepIssueHarness({
  content,
  issue
}: {
  content: DraftFormsStepContentV3;
  issue: V3DraftValidationIssue;
}) {
  const [activePosId, setActivePosId] = useState(content.pos[0]!.pos_id);
  return (
    <AntApp>
      <button onClick={() => setActivePosId(issue.node_location.pos_id!)}>
        定位深层 issue
      </button>
      <V3FormsAndPronunciationStep
        activePosId={activePosId}
        issues={[issue]}
        onActivePosChange={setActivePosId}
        onChange={() => undefined}
        value={content}
      />
      <output data-testid="active-pos-id">{activePosId}</output>
    </AntApp>
  );
}

function canonicalValue(): DraftFormsStepContentV3 {
  return JSON.parse(screen.getByTestId("canonical-value").textContent ?? "");
}

function formById(content: DraftFormsStepContentV3, formId: string) {
  return content.pos
    .flatMap((pos) => pos.forms)
    .find((form) => form.id === formId)!;
}

function fillUkUsMapping() {
  for (const [label, value] of [
    ["英式 映射拼写", "centre"],
    ["英式 映射字典音标", "ˈsentə"],
    ["英式 映射实际发音", "sentə"],
    ["美式 映射拼写", "center"],
    ["美式 映射字典音标", "ˈsentər"],
    ["美式 映射实际发音", "sentər"]
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), {
      target: { value }
    });
  }
}

function chooseOption(label: string, option: string) {
  fireEvent.mouseDown(screen.getByLabelText(label));
  const choice = [
    ...document.querySelectorAll<HTMLElement>(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
    )
  ].find((item) => item.textContent === option);
  if (!choice) throw new Error(`option not found: ${option}`);
  fireEvent.click(choice);
}

describe("V3FormsAndPronunciationStep", () => {
  beforeEach(() => {
    catalogState.data = partOfSpeechCatalogFixture;
    catalogState.isError = false;
    catalogState.pending = undefined;
  });

  it("I02 完整显示多 POS/多组/同类型多行，共享 form 同步编辑但不复制", async () => {
    const content = multiPosFixture();
    const sharedId = content.pos[0]!.forms[0]!.id;
    const secondId = content.pos[0]!.forms[1]!.id;
    const { container } = render(<Harness initial={content} />);

    expect(
      container.querySelectorAll(`[data-form-id="${sharedId}"]`)
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(`[data-form-id="${secondId}"]`)
    ).toHaveLength(1);
    expect(
      [...container.querySelectorAll(".v3-concrete-form-row .ant-tag")].filter(
        (tag) => tag.textContent === "原形"
      )
    ).toHaveLength(3);
    expect(await screen.findByText("名词")).toBeInTheDocument();
    expect(screen.getByText("动词")).toBeInTheDocument();

    const sharedInputs = screen.getAllByLabelText("词形 1通用拼写");
    fireEvent.change(sharedInputs[0]!, { target: { value: "shared-edited" } });

    expect(
      screen
        .getAllByLabelText<HTMLInputElement>("词形 1通用拼写")
        .every((input) => input.value === "shared-edited")
    ).toBe(true);
    expect(screen.getByLabelText("词形 2通用拼写")).toHaveValue("second-base");
    expect(content.pos[0]!.forms).toHaveLength(2);
    expect(canonicalValue().pos[0]!.forms).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("从变化组 2 移除词形 1"));
    expect(canonicalValue().pos[0]!.forms).toHaveLength(2);
    expect(canonicalValue().pos[0]!.form_groups[1]!.members).toEqual([]);
  });

  it("I02 使用 form UUID key，membership 重排时输入节点与焦点保持", () => {
    const content = multiPosFixture();
    const formId = content.pos[0]!.forms[0]!.id;
    const groupId = content.pos[0]!.form_groups[0]!.id;
    const { container } = render(<Harness initial={content} />);
    const target = screen.getAllByLabelText("词形 1通用拼写")[0]!;
    target.focus();
    const row = target.closest(`[data-form-id="${formId}"]`);

    fireEvent.click(screen.getByLabelText("下移变化组 1 的词形 1"));

    expect(document.activeElement).toBe(target);
    expect(target.closest(`[data-form-id="${formId}"]`)).toBe(row);
    const rows = container.querySelectorAll(
      `[data-group-id="${groupId}"] [data-form-id]`
    );
    expect(rows[1]).toHaveAttribute("data-form-id", formId);
  });

  it("I03 common 到 uk_us 必须显式 mapping 确认，取消不改且保留 form UUID", () => {
    const form = commonFormFixture({
      pronunciations: [
        pronunciationFixture({ id: uuidFromInt(301) }),
        pronunciationFixture({ id: uuidFromInt(302), style: "strong" })
      ]
    });
    const nextIds = [401, 402, 403, 404, 405, 406].map(uuidFromInt);
    render(
      <Harness
        initial={formsFixture({ forms: [form] })}
        idFactory={uuidSequence(...nextIds)}
      />
    );

    fireEvent.click(screen.getByLabelText("词形 1切换为英式和美式"));
    expect(screen.getByText(/现有 2 条发音不会被静默复制/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("取 消"));
    expect(formById(canonicalValue(), form.id).regional_variants.mode).toBe(
      "common"
    );

    fireEvent.click(screen.getByLabelText("词形 1切换为英式和美式"));
    fireEvent.change(screen.getByLabelText("英式 映射拼写"), {
      target: { value: "centre" }
    });
    fireEvent.change(screen.getByLabelText("英式 映射字典音标"), {
      target: { value: "ˈsentə" }
    });
    fireEvent.change(screen.getByLabelText("英式 映射实际发音"), {
      target: { value: "sentə" }
    });
    fireEvent.change(screen.getByLabelText("美式 映射拼写"), {
      target: { value: "center" }
    });
    fireEvent.change(screen.getByLabelText("美式 映射字典音标"), {
      target: { value: "ˈsentər" }
    });
    fireEvent.change(screen.getByLabelText("美式 映射实际发音"), {
      target: { value: "sentər" }
    });
    fireEvent.click(screen.getByText("确认转换"));

    const converted = formById(canonicalValue(), form.id);
    expect(converted.id).toBe(form.id);
    expect(converted.regional_variants).toMatchObject({
      mode: "uk_us",
      uk: {
        id: nextIds[0],
        spelling: "centre",
        pronunciations: [{ id: nextIds[1] }]
      },
      us: {
        id: nextIds[2],
        spelling: "center",
        pronunciations: [{ id: nextIds[3] }]
      }
    });

    fireEvent.click(screen.getByLabelText("词形 1切换为通用拼写"));
    fireEvent.change(screen.getByLabelText("通用 映射拼写"), {
      target: { value: "centre-center" }
    });
    fireEvent.change(screen.getByLabelText("通用 映射字典音标"), {
      target: { value: "ˈsentə" }
    });
    fireEvent.change(screen.getByLabelText("通用 映射实际发音"), {
      target: { value: "sentə" }
    });
    fireEvent.click(screen.getByText("确认转换"));

    expect(formById(canonicalValue(), form.id)).toMatchObject({
      id: form.id,
      regional_variants: {
        mode: "common",
        common: {
          id: nextIds[4],
          spelling: "centre-center",
          pronunciations: [{ id: nextIds[5] }]
        }
      }
    });
  });

  it("I02/I08 最后 membership 普通移除受控拒绝并引导原子删除 form", () => {
    const form = commonFormFixture();
    const content = formsFixture({ forms: [form] });
    render(<Harness initial={content} />);

    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    expect(screen.getByText(/这是该词形最后一个使用位置/)).toBeInTheDocument();
    expect(formById(canonicalValue(), form.id)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "删除整个词形" }));
    expect(canonicalValue().pos[0]!.forms).toEqual([]);
    expect(canonicalValue().pos[0]!.form_groups[0]!.members).toEqual([]);
  });

  it("I04 多发音使用 field.key，编辑、新增、删除与重排保持 pronunciation UUID", () => {
    const pronunciations = [
      pronunciationFixture({
        id: uuidFromInt(501),
        style: "normal",
        actual_pron: "one"
      }),
      pronunciationFixture({
        id: uuidFromInt(502),
        style: "strong",
        actual_pron: "two"
      }),
      pronunciationFixture({
        id: uuidFromInt(503),
        style: "weak",
        actual_pron: "three"
      })
    ];
    const form = commonFormFixture({ pronunciations });
    const addedId = uuidFromInt(504);
    const { container } = render(
      <Harness
        initial={formsFixture({ forms: [form] })}
        idFactory={() => addedId}
      />
    );
    const beforeKeys = new Map(
      [
        ...container.querySelectorAll<HTMLElement>("[data-pronunciation-id]")
      ].map((row) => [row.dataset.pronunciationId!, row.dataset.fieldKey!])
    );

    fireEvent.click(screen.getByLabelText("下移第 1 条发音"));
    const rows = [
      ...container.querySelectorAll<HTMLElement>("[data-pronunciation-id]")
    ];
    expect(rows.map((row) => row.dataset.pronunciationId)).toEqual([
      pronunciations[1]!.id,
      pronunciations[0]!.id,
      pronunciations[2]!.id
    ]);
    expect(
      new Map(
        rows.map((row) => [row.dataset.pronunciationId!, row.dataset.fieldKey!])
      )
    ).toEqual(beforeKeys);

    fireEvent.change(screen.getByLabelText("第 2 条发音的实际发音"), {
      target: { value: "one-edited" }
    });
    fireEvent.click(screen.getByLabelText("新增发音"));
    expect(screen.getByLabelText("第 4 条发音的实际发音")).toHaveValue("");
    fireEvent.click(screen.getByLabelText("删除第 3 条发音"));

    const variant = formById(canonicalValue(), form.id).regional_variants;
    if (variant.mode !== "common") throw new Error("expected common");
    expect(variant.common.pronunciations.map((item) => item.id)).toEqual([
      pronunciations[1]!.id,
      pronunciations[0]!.id,
      addedId
    ]);
    expect(variant.common.pronunciations[1]!.actual_pron).toBe("one-edited");
  });

  it("I08 draft 空态可编辑但不误报完成；complete issues 展示权威定位", () => {
    const { rerender } = render(
      <AntApp>
        <V3FormsAndPronunciationStep
          value={{ pos: [] }}
          onChange={() => undefined}
        />
      </AntApp>
    );
    expect(screen.getByText("草稿可暂时不添加词性")).toBeInTheDocument();
    expect(screen.queryByText(/已完成/)).toBeNull();

    const emptyIssues = validateFormsContent({ pos: [] }, "complete");
    rerender(
      <AntApp>
        <V3FormsAndPronunciationStep
          value={{ pos: [] }}
          onChange={() => undefined}
          issues={emptyIssues}
        />
      </AntApp>
    );
    expect(screen.getByText("完整词条至少需要一个词性")).toBeInTheDocument();

    const incomplete = formsFixture({
      forms: [commonFormFixture({ spelling: "", pronunciations: [] })]
    });
    const issues = validateFormsContent(incomplete, "complete");
    rerender(
      <AntApp>
        <V3FormsAndPronunciationStep
          value={incomplete}
          onChange={() => undefined}
          issues={issues}
        />
      </AntApp>
    );

    expect(screen.getByText("词形与发音尚未完成")).toBeInTheDocument();
    for (const issue of issues) {
      expect(screen.getByText(issue.message)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("词形 1通用拼写")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("I08 跨非当前 POS 的深层 issue 可逐层定位并 focus 精确 pronunciation 字段", () => {
    const content = multiPosFixture();
    const pos = content.pos[1]!;
    const group = pos.form_groups[0]!;
    const membership = group.members[0]!;
    const form = pos.forms[0]!;
    if (form.regional_variants.mode !== "common") throw new Error("fixture");
    const variant = form.regional_variants.common;
    const pronunciation = variant.pronunciations[0]!;
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: pronunciation.id,
      field: "actual_pron",
      code: "pronunciation_required",
      message: "实际发音待补充",
      node_location: {
        node_role: "forms.pronunciation",
        ancestor_node_ids: [
          pos.pos_id,
          group.id,
          membership.id,
          form.id,
          variant.id
        ],
        pos_id: pos.pos_id,
        form_group_id: group.id,
        membership_id: membership.id,
        form_id: form.id,
        variant_id: variant.id,
        dialect: "common",
        pronunciation_id: pronunciation.id
      }
    };
    const { container } = render(
      <DeepIssueHarness content={content} issue={issue} />
    );

    expect(screen.getByTestId("active-pos-id")).toHaveTextContent(
      content.pos[0]!.pos_id
    );
    fireEvent.click(screen.getByText("动词"));
    expect(screen.getByTestId("active-pos-id")).toHaveTextContent(pos.pos_id);
    fireEvent.click(screen.getByText("名词"));
    expect(screen.getByTestId("active-pos-id")).toHaveTextContent(
      content.pos[0]!.pos_id
    );
    fireEvent.click(screen.getByText("定位深层 issue"));
    expect(screen.getByTestId("active-pos-id")).toHaveTextContent(pos.pos_id);
    for (const nodeId of [
      pos.pos_id,
      group.id,
      membership.id,
      form.id,
      variant.id,
      pronunciation.id
    ]) {
      expect(
        container.querySelector(`[data-v3-node-id="${nodeId}"]`)
      ).not.toBeNull();
    }
    const field = container.querySelector<HTMLElement>(
      `[data-v3-node-id="${pronunciation.id}"][data-v3-field="actual_pron"]`
    );
    expect(field).not.toBeNull();
    field!.focus();
    expect(document.activeElement).toBe(field);
  });

  it("覆盖默认受控参数、无变化组与空组/缺失 form 的草稿分支", () => {
    const onChange = vi.fn();
    const emptyGroups = formsFixture({ groups: [] });
    const { rerender } = render(
      <AntApp>
        <V3FormsAndPronunciationStep onChange={onChange} value={emptyGroups} />
      </AntApp>
    );

    expect(screen.getByText("草稿可暂时不添加变化组")).toBeInTheDocument();
    fireEvent.click(screen.getByText("名词"));
    expect(onChange).not.toHaveBeenCalled();

    const missingFormId = uuidFromInt(980);
    const pos = {
      ...emptyGroups.pos[0]!,
      forms: [],
      form_groups: [
        {
          id: uuidFromInt(981),
          is_regular: false,
          members: []
        },
        {
          id: uuidFromInt(982),
          is_regular: false,
          members: [{ id: uuidFromInt(983), form_id: missingFormId }]
        }
      ]
    };
    const content = { pos: [pos] };
    rerender(
      <AntApp>
        <V3PosTab
          content={content}
          idFactory={() => uuidFromInt(984)}
          issues={[]}
          onChange={onChange}
          pos={pos}
        />
      </AntApp>
    );

    expect(screen.getByText("草稿可暂时保留空变化组")).toBeInTheDocument();
    expect(
      screen.getByText("该变化组引用的词形不存在，已停止编辑。")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("新增名词变化组")).toBeInTheDocument();
    expect(screen.queryByLabelText(/noun/)).toBeNull();
    expect(screen.queryByText("规则组")).toBeNull();
  });

  it("覆盖 group 首尾禁用、向上重排与缺省 membership count", () => {
    const forms = [
      commonFormFixture({ id: uuidFromInt(601) }),
      commonFormFixture({ id: uuidFromInt(602) }),
      commonFormFixture({ id: uuidFromInt(603) })
    ];
    const formGroup: WordFormGroupV3 = {
      id: uuidFromInt(610),
      is_regular: false,
      members: forms.map((form, index) => ({
        id: uuidFromInt(620 + index),
        form_id: form.id
      }))
    };
    const content = formsFixture({ forms, groups: [formGroup] });
    const onChange = vi.fn();
    render(
      <AntApp>
        <V3FormGroupCard
          content={content}
          group={formGroup}
          groupIndex={0}
          idFactory={() => uuidFromInt(699)}
          issues={[]}
          membershipCounts={new Map()}
          onChange={onChange}
          pos={content.pos[0]!}
        />
      </AntApp>
    );

    expect(screen.getByLabelText("上移变化组 1 的词形 1")).toBeDisabled();
    expect(screen.getByLabelText("下移变化组 1 的词形 3")).toBeDisabled();
    expect(screen.queryByText(/共享于/)).toBeNull();

    fireEvent.click(screen.getByLabelText("上移变化组 1 的词形 3"));
    const next = onChange.mock.calls[0]![0] as DraftFormsStepContentV3;
    expect(
      next.pos[0]!.form_groups[0]!.members.map((item) => item.form_id)
    ).toEqual([forms[0]!.id, forms[2]!.id, forms[1]!.id]);
  });

  it("覆盖 membership stale 失败、最后删除失败与关闭 gate", () => {
    const form = commonFormFixture({ id: uuidFromInt(701) });
    const displayed = formsFixture({ forms: [form] });
    const displayedGroup = displayed.pos[0]!.form_groups[0]!;
    const stale = formsFixture({ forms: [form], groups: [] });
    const onChange = vi.fn();
    const { rerender, container } = render(
      <AntApp>
        <V3FormGroupCard
          content={stale}
          group={displayedGroup}
          groupIndex={0}
          idFactory={() => uuidFromInt(702)}
          issues={[]}
          membershipCounts={new Map([[form.id, 1]])}
          onChange={onChange}
          pos={stale.pos[0]!}
        />
      </AntApp>
    );

    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("不能留下孤立词形")).toBeNull();

    rerender(
      <AntApp>
        <V3FormGroupCard
          content={displayed}
          group={displayedGroup}
          groupIndex={0}
          idFactory={() => uuidFromInt(702)}
          issues={[]}
          membershipCounts={new Map([[form.id, 1]])}
          onChange={onChange}
          pos={displayed.pos[0]!}
        />
      </AntApp>
    );
    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    expect(screen.getByText("不能留下孤立词形")).toBeInTheDocument();

    const missingForm = formsFixture({ forms: [], groups: [] });
    rerender(
      <AntApp>
        <V3FormGroupCard
          content={missingForm}
          group={displayedGroup}
          groupIndex={0}
          idFactory={() => uuidFromInt(702)}
          issues={[]}
          membershipCounts={new Map()}
          onChange={onChange}
          pos={missingForm.pos[0]!}
        />
      </AntApp>
    );
    fireEvent.click(screen.getByRole("button", { name: "删除整个词形" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("不能留下孤立词形")).toBeNull();

    rerender(
      <AntApp>
        <V3FormGroupCard
          content={displayed}
          group={displayedGroup}
          groupIndex={0}
          idFactory={() => uuidFromInt(702)}
          issues={[]}
          membershipCounts={new Map([[form.id, 1]])}
          onChange={onChange}
          pos={displayed.pos[0]!}
        />
      </AntApp>
    );
    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    fireEvent.click(container.querySelector(".ant-alert-close-icon")!);
    expect(screen.queryByText("不能留下孤立词形")).toBeNull();
  });

  it("覆盖 UK/US 双区域、字段 issue 与 stale 映射确认失败", () => {
    const form = ukUsFormFixture({ id: uuidFromInt(801) });
    const content = formsFixture({ forms: [form] });
    const ukIssue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: form.regional_variants.uk.id,
      field: "spelling",
      code: "variant_spelling_required",
      message: "UK 拼写待补充",
      node_location: {
        node_role: "forms.variant",
        ancestor_node_ids: [content.pos[0]!.pos_id, form.id],
        pos_id: content.pos[0]!.pos_id,
        form_id: form.id,
        variant_id: form.regional_variants.uk.id,
        dialect: "uk"
      }
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <AntApp>
        <V3ConcreteFormRow
          content={content}
          form={form}
          idFactory={() => uuidFromInt(899)}
          issues={[ukIssue]}
          membershipCount={0}
          onChange={onChange}
        />
      </AntApp>
    );

    expect(screen.getByLabelText("词形英式拼写")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("词形美式拼写")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    fireEvent.change(screen.getByLabelText("词形美式拼写"), {
      target: { value: "centered" }
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    const common = commonFormFixture({ id: form.id });
    const commonContent = formsFixture({ forms: [common] });
    rerender(
      <AntApp>
        <V3ConcreteFormRow
          content={commonContent}
          form={common}
          idFactory={() => uuidFromInt(899)}
          issues={[]}
          membershipCount={1}
          onChange={onChange}
        />
      </AntApp>
    );
    fireEvent.click(screen.getByLabelText("词形切换为英式和美式"));
    fillUkUsMapping();

    rerender(
      <AntApp>
        <V3ConcreteFormRow
          content={content}
          form={form}
          idFactory={() => uuidFromInt(899)}
          issues={[]}
          membershipCount={1}
          onChange={onChange}
        />
      </AntApp>
    );
    const confirmButton = screen.getByRole("button", { name: "确认转换" });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("覆盖 UK 发音缺省 style、字段编辑、首尾重排、增删与 issue", () => {
    const first = pronunciationFixture({
      id: uuidFromInt(901),
      dict_phonetic: "first-dict",
      actual_pron: "first-actual",
      style: undefined
    });
    const second = pronunciationFixture({
      id: uuidFromInt(902),
      style: "strong"
    });
    const form = ukUsFormFixture({
      id: uuidFromInt(903),
      uk: { pronunciations: [first, second] }
    });
    const content = formsFixture({ forms: [form] });
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: first.id,
      field: "actual_pron",
      code: "pronunciation_required",
      message: "实际发音待补充",
      node_location: {
        node_role: "forms.pronunciation",
        ancestor_node_ids: [
          content.pos[0]!.pos_id,
          form.id,
          form.regional_variants.uk.id
        ],
        pos_id: content.pos[0]!.pos_id,
        form_id: form.id,
        variant_id: form.regional_variants.uk.id,
        dialect: "uk",
        pronunciation_id: first.id
      }
    };
    const onChange = vi.fn();
    const addedId = uuidFromInt(904);
    render(
      <AntApp>
        <V3PronunciationList
          content={content}
          idFactory={() => addedId}
          issues={[issue]}
          onChange={onChange}
          variant={form.regional_variants.uk}
        />
      </AntApp>
    );

    expect(screen.getByLabelText("上移第 1 条发音")).toBeDisabled();
    expect(screen.getByLabelText("下移第 2 条发音")).toBeDisabled();
    expect(screen.getByLabelText("第 1 条发音的实际发音")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("第 1 条发音的字典音标")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByLabelText("第 1 条发音的发音方式")).toHaveValue("");

    fireEvent.click(screen.getByLabelText("上移第 2 条发音"));
    fireEvent.change(screen.getByLabelText("第 2 条发音的字典音标"), {
      target: { value: "edited-dict" }
    });
    fireEvent.change(screen.getByLabelText("第 2 条发音的实际发音"), {
      target: { value: "edited-actual" }
    });
    fireEvent.mouseDown(screen.getByLabelText("第 2 条发音的发音方式"));
    fireEvent.click(screen.getAllByText("弱读").at(-1)!);
    fireEvent.click(screen.getByLabelText("新增发音"));
    fireEvent.click(screen.getByLabelText("删除第 2 条发音"));

    expect(onChange).toHaveBeenCalledTimes(6);
    const added = onChange.mock.calls[4]![0] as DraftFormsStepContentV3;
    const addedForm = added.pos[0]!.forms[0]!;
    if (addedForm.regional_variants.mode !== "uk_us")
      throw new Error("fixture");
    expect(addedForm.regional_variants.uk.pronunciations.at(-1)).toEqual({
      id: addedId,
      dict_phonetic: "",
      actual_pron: "",
      style: "normal"
    });
    const removed = onChange.mock.calls[5]![0] as DraftFormsStepContentV3;
    const removedForm = removed.pos[0]!.forms[0]!;
    if (removedForm.regional_variants.mode !== "uk_us")
      throw new Error("fixture");
    expect(
      removedForm.regional_variants.uk.pronunciations.some(
        (item) => item.id === second.id
      )
    ).toBe(false);
  });

  it("覆盖 canonical rerender 时发音列表瞬态缺失与空态", () => {
    const pronunciation = pronunciationFixture({ id: uuidFromInt(951) });
    const form = commonFormFixture({ pronunciations: [pronunciation] });
    const content = formsFixture({ forms: [form] });
    const onChange = vi.fn();
    const { rerender } = render(
      <AntApp>
        <V3PronunciationList
          content={content}
          idFactory={() => uuidFromInt(952)}
          issues={[]}
          onChange={onChange}
          variant={form.regional_variants.common}
        />
      </AntApp>
    );
    expect(screen.getByLabelText("第 1 条发音的实际发音")).toBeInTheDocument();

    const emptyForm = commonFormFixture({
      id: form.id,
      variant_id: form.regional_variants.common.id,
      pronunciations: []
    });
    const emptyContent = formsFixture({ forms: [emptyForm] });
    rerender(
      <AntApp>
        <V3PronunciationList
          content={emptyContent}
          idFactory={() => uuidFromInt(952)}
          issues={[]}
          onChange={onChange}
          variant={emptyForm.regional_variants.common}
        />
      </AntApp>
    );

    expect(screen.getByText("暂无发音")).toBeInTheDocument();
    expect(screen.queryByLabelText("第 1 条发音的实际发音")).toBeNull();
  });

  it("P1-1 从空 skeleton 经 catalog UI 构建多 POS/组/重复 base/共享与移动 membership", async () => {
    const ids = Array.from({ length: 20 }, (_, index) =>
      uuidFromInt(1_000 + index)
    );
    render(<Harness initial={{ pos: [] }} idFactory={uuidSequence(...ids)} />);

    await waitFor(() =>
      expect(screen.getByLabelText("待新增词性")).not.toBeDisabled()
    );
    chooseOption("待新增词性", "名词");
    fireEvent.click(screen.getByRole("button", { name: "新增词性" }));
    expect(canonicalValue().pos[0]).toMatchObject({
      pos_id: ids[0],
      pos: "noun",
      forms: [],
      form_groups: []
    });

    fireEvent.click(screen.getByRole("button", { name: "新增名词变化组" }));
    const firstGroupId = ids[1]!;
    fireEvent.click(
      screen.getByRole("button", {
        name: "变化组 1 新增词形"
      })
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "变化组 1 新增词形"
      })
    );
    const firstFormId = ids[2]!;
    const firstMembershipId = ids[4]!;
    const secondFormId = ids[5]!;
    expect(
      canonicalValue().pos[0]!.forms.map((item) => item.form_type)
    ).toEqual(["base", "base"]);

    fireEvent.click(screen.getByRole("button", { name: "新增名词变化组" }));
    const secondGroupId = ids[8]!;
    chooseOption("变化组 2 选择已有词形", "原形 · 未填写拼写");
    fireEvent.click(
      screen.getByRole("button", { name: "变化组 2 复用已有词形" })
    );

    chooseOption("移动词形 2 到其他变化组", "变化组 2");
    const noun = canonicalValue().pos[0]!;
    expect(noun.forms).toHaveLength(2);
    expect(noun.form_groups[0]!.members.map((item) => item.form_id)).toEqual([
      firstFormId
    ]);
    expect(noun.form_groups[1]!.members.map((item) => item.form_id)).toEqual([
      firstFormId,
      secondFormId
    ]);
    expect(noun.form_groups[0]!.members[0]!.id).toBe(firstMembershipId);

    const sharedInputs = screen.getAllByLabelText("词形 1通用拼写");
    expect(sharedInputs).toHaveLength(2);
    fireEvent.change(sharedInputs[0]!, { target: { value: "orbit" } });
    expect(
      screen
        .getAllByLabelText<HTMLInputElement>("词形 1通用拼写")
        .every((input) => input.value === "orbit")
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("词形 2切换为英式和美式"));
    fillUkUsMapping();
    fireEvent.click(screen.getByRole("button", { name: "确认转换" }));
    expect(formById(canonicalValue(), secondFormId)).toMatchObject({
      id: secondFormId,
      regional_variants: { mode: "uk_us" }
    });

    fireEvent.click(screen.getByRole("button", { name: "上移变化组 2" }));
    expect(canonicalValue().pos[0]!.form_groups.map((item) => item.id)).toEqual(
      [secondGroupId, firstGroupId]
    );

    chooseOption("待新增词性", "动词");
    fireEvent.click(screen.getByRole("button", { name: "新增词性" }));
    expect(canonicalValue().pos.map((item) => item.pos)).toEqual([
      "noun",
      "verb"
    ]);
  }, 15_000);

  it("P1-1 新增 form_type 候选严格消费当前后端 catalog", async () => {
    const dynamicCatalog = structuredClone(partOfSpeechCatalogFixture);
    const noun = dynamicCatalog.items.find((item) => item.code === "noun")!;
    noun.allowed_form_types = ["comparative"];
    noun.default_form_types = [];
    catalogState.data = dynamicCatalog;
    const content = formsFixture({ forms: [], groups: [] });
    content.pos[0]!.form_groups.push({
      id: uuidFromInt(1_100),
      is_regular: false,
      members: []
    });
    render(
      <Harness
        initial={content}
        idFactory={uuidSequence(
          uuidFromInt(1_101),
          uuidFromInt(1_102),
          uuidFromInt(1_103)
        )}
      />
    );

    await waitFor(() =>
      expect(screen.getByLabelText("变化组 1 新增词形类型")).not.toBeDisabled()
    );
    chooseOption("变化组 1 新增词形类型", "比较级");
    fireEvent.click(
      screen.getByRole("button", {
        name: "变化组 1 新增词形"
      })
    );
    expect(canonicalValue().pos[0]!.forms).toMatchObject([
      { form_type: "comparative" }
    ]);
    expect(screen.queryByText("复数", { exact: true })).toBeNull();
  });

  it("P1-3 普通删除组遇 orphan form 时先列出影响并等待明确确认", async () => {
    const form = commonFormFixture();
    const addedFormId = uuidFromInt(1_181);
    const content = formsFixture({ forms: [form] });
    const firstRender = render(
      <Harness
        idFactory={uuidSequence(
          addedFormId,
          uuidFromInt(1_182),
          uuidFromInt(1_183)
        )}
        initial={content}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组 1"
      })
    );
    expect(screen.getByText("删除变化组需要额外确认")).toBeInTheDocument();
    expect(screen.getByText("受影响词形 1")).toBeInTheDocument();
    expect(canonicalValue().pos[0]).toMatchObject({
      forms: content.pos[0]!.forms,
      form_groups: content.pos[0]!.form_groups
    });

    fireEvent.click(screen.getByRole("button", { name: "取 消" }));
    expect(screen.queryByText("删除变化组需要额外确认")).toBeNull();
    expect(canonicalValue().pos[0]).toMatchObject({
      forms: content.pos[0]!.forms,
      form_groups: content.pos[0]!.form_groups
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组 1"
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText("变化组 1 新增词形类型")).not.toBeDisabled()
    );
    chooseOption("变化组 1 新增词形类型", "复数");
    fireEvent.click(
      screen.getByRole("button", {
        name: "变化组 1 新增词形"
      })
    );
    expect(canonicalValue().pos[0]!.forms).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组并同时删除 1 个不再被其他变化组使用的词形"
      })
    );
    expect(screen.getByText("删除影响已变化，请重新确认")).toBeInTheDocument();
    expect(screen.getByText("受影响词形 2")).toBeInTheDocument();
    expect(canonicalValue().pos[0]!.forms).toHaveLength(2);
    expect(canonicalValue().pos[0]!.form_groups).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组并同时删除 2 个不再被其他变化组使用的词形"
      })
    );
    expect(canonicalValue().pos[0]).toMatchObject({
      forms: [],
      form_groups: []
    });
    firstRender.unmount();

    catalogState.data = undefined;
    catalogState.isError = true;
    const { unmount } = render(
      <AntApp>
        <V3FormsAndPronunciationStep
          onChange={() => undefined}
          value={{ pos: [] }}
        />
      </AntApp>
    );
    expect(
      await screen.findByText("词性目录不可用，已停止新增结构")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增词性" })).toBeDisabled();
    unmount();
  }, 15_000);

  it("P1-3 删除仅含 shared form 的组无需破坏性确认且保留 form", () => {
    const shared = commonFormFixture({ id: uuidFromInt(1_150) });
    const firstGroup = group(uuidFromInt(1_151), [
      { id: uuidFromInt(1_153), form_id: shared.id }
    ]);
    const secondGroup = group(uuidFromInt(1_152), [
      { id: uuidFromInt(1_154), form_id: shared.id }
    ]);
    const content = formsFixture({
      forms: [shared],
      groups: [firstGroup, secondGroup]
    });
    render(<Harness initial={content} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组 1"
      })
    );

    expect(screen.queryByText("删除变化组需要额外确认")).toBeNull();
    expect(canonicalValue().pos[0]!.forms).toEqual([shared]);
    expect(canonicalValue().pos[0]!.form_groups).toEqual([secondGroup]);
  });

  it("catalog 请求在卸载后失败时不回写已卸载组件", async () => {
    let rejectCatalog!: (reason?: unknown) => void;
    catalogState.pending = new Promise((_, reject) => {
      rejectCatalog = reject;
    });
    const { unmount } = render(
      <AntApp>
        <V3FormsAndPronunciationStep
          onChange={() => undefined}
          value={{ pos: [] }}
        />
      </AntApp>
    );

    unmount();
    await act(async () => {
      rejectCatalog(new Error("late catalog failure"));
      await Promise.resolve();
    });
  });

  it("删除受控活动 POS 后选择相邻项，删除最后一项时不发出非法 active key", async () => {
    const initial = multiPosFixture();
    const activeChanges = vi.fn();

    function ControlledHarness() {
      const [value, setValue] = useState(initial);
      const [activePosId, setActivePosId] = useState(initial.pos[0]!.pos_id);
      const changeActivePos = (posId: string) => {
        activeChanges(posId);
        setActivePosId(posId);
      };
      return (
        <AntApp>
          <V3FormsAndPronunciationStep
            activePosId={activePosId}
            onActivePosChange={changeActivePos}
            onChange={setValue}
            value={value}
          />
          <output data-testid="controlled-active-pos">{activePosId}</output>
          <output data-testid="controlled-pos-count">{value.pos.length}</output>
        </AntApp>
      );
    }

    render(<ControlledHarness />);
    await waitFor(() =>
      expect(screen.getByLabelText("待新增词性")).not.toBeDisabled()
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除词性名词"
      })
    );
    expect(screen.getByTestId("controlled-active-pos")).toHaveTextContent(
      initial.pos[1]!.pos_id
    );
    expect(activeChanges).toHaveBeenLastCalledWith(initial.pos[1]!.pos_id);

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除词性动词"
      })
    );
    expect(screen.getByTestId("controlled-pos-count")).toHaveTextContent("0");
    expect(activeChanges).toHaveBeenCalledTimes(1);
  });
});
