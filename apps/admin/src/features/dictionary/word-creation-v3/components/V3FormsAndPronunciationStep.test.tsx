import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordFormGroupV3
} from "@tsz/types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";
import { V3FormGroupCard } from "./V3FormGroupCard";
import { V3FormsAndPronunciationStep } from "./V3FormsAndPronunciationStep";
import { V3PosTab } from "./V3PosTab";
import { V3PronunciationList } from "./V3PronunciationList";

const formsCss = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith("/apps/admin")
      ? "src/features/dictionary/word-creation-v3/v3-forms.css"
      : "apps/admin/src/features/dictionary/word-creation-v3/v3-forms.css"
  ),
  "utf8"
);

const catalogState = vi.hoisted(() => ({
  data: undefined as typeof partOfSpeechCatalogFixture | undefined,
  isError: false,
  pending: undefined as Promise<typeof partOfSpeechCatalogFixture> | undefined
}));
const componentLookupState = vi.hoisted(() => ({ resolve: vi.fn() }));

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

vi.mock("../api", () => ({
  createV3WordRequests: () => ({
    resolveSentenceTargets: componentLookupState.resolve
  })
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
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "unified"
        },
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
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "unified"
        },
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

async function chooseGroupAction(groupIndex: number, action: string) {
  fireEvent.click(screen.getByLabelText(`管理第 ${groupIndex} 组词形变化`));
  const choices = await screen.findAllByText(action);
  fireEvent.click(choices.at(-1)!);
}

describe("V3FormsAndPronunciationStep", () => {
  it("基本词性徽标按本地词形草稿实时递减且不依赖发布问题", () => {
    const initial = formsFixture({
      forms: [
        commonFormFixture({
          pronunciations: [pronunciationFixture({ actual_pron: "" })]
        })
      ]
    });
    render(<Harness initial={initial} issues={[]} />);

    expect(screen.getByTitle("该词性未填项")).toHaveTextContent("1");
    fireEvent.change(screen.getByLabelText("第 1 条发音的实际发音"), {
      target: { value: "centre" }
    });
    expect(screen.getByTitle("该词性未填项")).toHaveAttribute(
      "data-show",
      "false"
    );
    expect(screen.getByLabelText("第 1 条发音的实际发音")).not.toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  beforeEach(() => {
    catalogState.data = partOfSpeechCatalogFixture;
    catalogState.isError = false;
    catalogState.pending = undefined;
    componentLookupState.resolve.mockReset();
    componentLookupState.resolve.mockResolvedValue({
      schema_version: 3,
      sentence_hash: "hash",
      discovery_generation: 1,
      completeness: "complete",
      range_results: []
    });
  });

  it("使用 V2 Step 2 的标题、词性页签与英美词形矩阵结构", async () => {
    const regional = ukUsFormFixture({
      id: uuidFromInt(90),
      uk: { spelling: "centres" },
      us: { spelling: "centers" }
    });
    const { container } = render(
      <Harness initial={formsFixture({ forms: [regional] })} />
    );

    expect(screen.getByText("STEP 02")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "词形与发音" })
    ).toBeVisible();
    expect(container.querySelector(".word-step-heading")).not.toBeNull();
    expect(
      container.querySelector(".word-pos-tabs.word-forms-tabs")
    ).not.toBeNull();
    await waitFor(() =>
      expect(container.querySelector(".word-form-group-card")).not.toBeNull()
    );
    expect(
      container.querySelector(".word-form-matrix, .v3-dialect-separated-matrix")
    ).not.toBeNull();
    expect(screen.getByText("词形类型")).toBeVisible();
    expect(screen.getByText("英式英语 · BrE")).toBeVisible();
    expect(screen.getByText("美式英语 · AmE")).toBeVisible();
    expect(await screen.findByText("名词")).toBeVisible();
  });

  it("DD 多条 form 使用独立类型列与两张完整方言面板", async () => {
    const firstBase = ukUsFormFixture({
      id: uuidFromInt(2101),
      uk: { id: uuidFromInt(2111), spelling: "centre" },
      us: { id: uuidFromInt(2112), spelling: "center" }
    });
    const secondBase = ukUsFormFixture({
      id: uuidFromInt(2102),
      uk: { id: uuidFromInt(2113), spelling: "harbour" },
      us: { id: uuidFromInt(2114), spelling: "harbor" }
    });
    const plural = ukUsFormFixture({
      id: uuidFromInt(2103),
      form_type: "plural",
      uk: { id: uuidFromInt(2115), spelling: "centres" },
      us: { id: uuidFromInt(2116), spelling: "centers" }
    });
    const content = formsFixture({
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      },
      forms: [firstBase, secondBase, plural],
      groups: [
        group(uuidFromInt(2121), [
          { id: uuidFromInt(2131), form_id: firstBase.id },
          { id: uuidFromInt(2132), form_id: secondBase.id },
          { id: uuidFromInt(2133), form_id: plural.id }
        ]),
        group(uuidFromInt(2122), [
          { id: uuidFromInt(2134), form_id: firstBase.id }
        ])
      ]
    });
    const { container } = render(<Harness initial={content} />);

    const matrices = await waitFor(() => {
      const items = container.querySelectorAll<HTMLElement>(
        ".v3-dialect-separated-matrix"
      );
      expect(items).toHaveLength(2);
      return items;
    });
    const firstMatrix = matrices[0]!;
    const typeColumn = firstMatrix.querySelector(
      ":scope > .v3-form-type-column"
    );
    const ukPanel = firstMatrix.querySelector(":scope > .v3-dialect-panel-uk");
    const usPanel = firstMatrix.querySelector(":scope > .v3-dialect-panel-us");

    expect(typeColumn).not.toBeNull();
    expect(ukPanel).not.toBeNull();
    expect(usPanel).not.toBeNull();
    expect(typeColumn!.querySelectorAll(".v3-membership-row")).toHaveLength(3);
    expect(ukPanel!.querySelectorAll(".v3-dialect-form-cell")).toHaveLength(3);
    expect(usPanel!.querySelectorAll(".v3-dialect-form-cell")).toHaveLength(3);
    expect(
      firstMatrix.querySelector(".word-form-matrix-distinguish")
    ).toBeNull();
    expect(
      firstMatrix.querySelectorAll(".word-form-type-cell > .ant-select")
    ).toHaveLength(3);
    expect(
      screen.getByLabelText("变化组 1 词形 1 类型").closest(".ant-select")
    ).toHaveTextContent("原形");
    expect(
      screen.getByLabelText("变化组 1 词形 2 类型").closest(".ant-select")
    ).toHaveTextContent("原形");
    expect(matrices[1]!.querySelectorAll(".v3-membership-row")).toHaveLength(1);
    expect(canonicalValue()).toEqual(content);
  });

  it("UD 在两张方言面板显示相同拼写并保持双方言发音独立", async () => {
    const ukPronunciation = pronunciationFixture({ id: uuidFromInt(2141) });
    const usPronunciation = pronunciationFixture({ id: uuidFromInt(2142) });
    const form = ukUsFormFixture({
      id: uuidFromInt(2140),
      uk: {
        id: uuidFromInt(2143),
        spelling: "harbor",
        pronunciations: [ukPronunciation]
      },
      us: {
        id: uuidFromInt(2144),
        spelling: "harbor",
        pronunciations: [usPronunciation]
      }
    });
    const { container } = render(
      <Harness
        initial={formsFixture({
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "distinguish"
          },
          forms: [form]
        })}
      />
    );

    await waitFor(() =>
      expect(
        container.querySelector(".v3-dialect-separated-matrix")
      ).not.toBeNull()
    );
    const ukPanel = container.querySelector(".v3-dialect-panel-uk")!;
    const usPanel = container.querySelector(".v3-dialect-panel-us")!;
    expect(
      within(ukPanel as HTMLElement).getByText("英式英语 · BrE")
    ).toBeVisible();
    expect(
      within(usPanel as HTMLElement).getByText("美式英语 · AmE")
    ).toBeVisible();
    expect(ukPanel.querySelectorAll(".word-pronunciation-editor")).toHaveLength(
      1
    );
    expect(usPanel.querySelectorAll(".word-pronunciation-editor")).toHaveLength(
      1
    );
    expect(screen.getByLabelText("原形英式拼写")).toHaveValue("harbor");
    expect(screen.getByLabelText("原形美式拼写")).toHaveValue("harbor");

    fireEvent.change(screen.getByLabelText("原形英式拼写"), {
      target: { value: "harbour" }
    });

    expect(screen.getByLabelText("原形英式拼写")).toHaveValue("harbour");
    expect(screen.getByLabelText("原形美式拼写")).toHaveValue("harbour");
    const updated = formById(canonicalValue(), form.id);
    expect(updated).toMatchObject({
      id: form.id,
      regional_variants: {
        mode: "uk_us",
        uk: {
          id: form.regional_variants.uk.id,
          spelling: "harbour",
          pronunciations: [{ id: ukPronunciation.id }]
        },
        us: {
          id: form.regional_variants.us.id,
          spelling: "harbour",
          pronunciations: [{ id: usPronunciation.id }]
        }
      }
    });
  });

  it("UU 保持英美共用结构且不渲染独立 BrE/AmE 面板", async () => {
    const common = commonFormFixture({
      id: uuidFromInt(2151),
      variant_id: uuidFromInt(2152),
      spelling: "harbor"
    });
    const { container } = render(
      <Harness initial={formsFixture({ forms: [common] })} />
    );

    expect((await screen.findAllByText("英美共用")).length).toBeGreaterThan(0);
    expect(container.querySelector(".word-form-matrix-unified")).not.toBeNull();
    expect(container.querySelector(".v3-dialect-separated-matrix")).toBeNull();
    expect(container.querySelector(".v3-dialect-panel-uk")).toBeNull();
    expect(container.querySelector(".v3-dialect-panel-us")).toBeNull();
    expect(screen.getByLabelText("原形通用拼写")).toHaveValue("harbor");
  });

  it("类型单元加号在当前行下方新增同类型 form，并移除底部类型选择入口", async () => {
    const base = commonFormFixture({
      id: uuidFromInt(2161),
      variant_id: uuidFromInt(2162),
      spelling: "harbor"
    });
    const generated = [2171, 2172, 2173, 2174].map(uuidFromInt);
    const content = formsFixture({ forms: [base] });
    render(
      <Harness initial={content} idFactory={uuidSequence(...generated)} />
    );

    const addButton =
      await screen.findByLabelText("在原形 1 下方添加同类型词形");
    expect(addButton.tagName).toBe("BUTTON");
    expect(
      [...addButton.parentElement!.querySelectorAll("button")].map((button) =>
        button.getAttribute("aria-label")
      )
    ).toEqual([
      "上移变化组 1 的词形 1",
      "下移变化组 1 的词形 1",
      "在原形 1 下方添加同类型词形",
      "从变化组 1 移除词形 1"
    ]);
    expect(screen.queryByLabelText("变化组 1 新增词形类型")).toBeNull();
    expect(screen.queryByLabelText("变化组 1 新增词形")).toBeNull();
    expect(screen.getByLabelText("从变化组 1 移除词形 1")).toBeDisabled();

    fireEvent.click(addButton);

    await waitFor(() =>
      expect(screen.getByLabelText("变化组 1 词形 2 类型")).toBeInTheDocument()
    );
    const next = canonicalValue();
    expect(next.pos[0]!.forms.map((form) => form.id)).toEqual([
      base.id,
      generated[0]
    ]);
    expect(next.pos[0]!.forms.map((form) => form.form_type)).toEqual([
      "base",
      "base"
    ]);
    expect(
      next.pos[0]!.form_groups[0]!.members.map((member) => member.form_id)
    ).toEqual([base.id, generated[0]]);
    expect(next.pos[0]!.form_groups[0]!.members[0]).toEqual(
      content.pos[0]!.form_groups[0]!.members[0]
    );
    expect(screen.getByLabelText("从变化组 1 移除词形 1")).not.toBeDisabled();
    expect(screen.getByLabelText("从变化组 1 移除词形 2")).not.toBeDisabled();
    expect(
      screen
        .getAllByLabelText(/下方添加同类型词形/)
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["在原形 1 下方添加同类型词形", "在原形 2 下方添加同类型词形"]);
  });

  it("方言独立矩阵 CSS 固定宽屏留白/圆角并在窄屏按 V2 双行堆叠", () => {
    expect(formsCss).toMatch(
      /\.v3-form-group-card\s*>\s*\.ant-card-body\s*>\s*\.ant-flex\s*\{[^}]*padding-bottom:\s*16px;/su
    );
    expect(formsCss).toContain(".v3-dialect-separated-matrix {");
    expect(formsCss).toContain(
      "grid-template-columns: 142px repeat(2, minmax(0, 1fr));"
    );
    expect(formsCss).toContain("column-gap: 28px;");
    expect(formsCss).toMatch(
      /\.v3-dialect-panel \{[\s\S]*?border: 1px solid;[\s\S]*?border-radius: 14px;/
    );
    expect(formsCss).toMatch(
      /@container word-creation-content \(max-width: 900px\)[\s\S]*?\.v3-dialect-separated-matrix \{[\s\S]*?grid-template-columns: 112px minmax\(0, 1fr\);[\s\S]*?overflow-x: visible;/
    );
    expect(formsCss).toMatch(
      /@container word-creation-content \(max-width: 900px\)[\s\S]*?\.v3-form-type-column[\s\S]*?display: contents;/
    );
    expect(formsCss).toMatch(
      /\.v3-membership-actions \{[\s\S]*?flex-wrap: wrap;[\s\S]*?min-width: 0;/
    );
  });

  it("以实际产品图为基准恢复词性 Tab 与同组词形矩阵层级", async () => {
    const base = commonFormFixture({
      id: uuidFromInt(701),
      variant_id: uuidFromInt(711),
      spelling: "centre"
    });
    const secondBase = commonFormFixture({
      id: uuidFromInt(702),
      variant_id: uuidFromInt(712),
      spelling: "center"
    });
    const plural = ukUsFormFixture({
      id: uuidFromInt(703),
      form_type: "plural",
      uk: { id: uuidFromInt(713), spelling: "centres" },
      us: { id: uuidFromInt(714), spelling: "centers" }
    });
    const content = formsFixture({
      forms: [base, secondBase, plural],
      groups: [
        group(uuidFromInt(721), [
          { id: uuidFromInt(731), form_id: base.id },
          { id: uuidFromInt(732), form_id: secondBase.id },
          { id: uuidFromInt(733), form_id: plural.id }
        ])
      ],
      pos: "noun"
    });
    const { container } = render(<Harness initial={content} />);

    expect(await screen.findByText("名词")).toBeVisible();
    expect(
      screen.getByText(
        "先添加基本词性，再录入各种词形。录入词形时，不要遗漏 1) 英式或美式、2) 规则变化或不规则变化。录入字典音标获取音频，录入实际发音时需严格按照 “天生之®通用英语音标字母表” 进行操作。"
      )
    ).toBeVisible();
    const addBasicPosSelect = screen
      .getByLabelText("添加基本词性")
      .closest(".ant-select");
    expect(addBasicPosSelect).toHaveClass("word-add-basic-pos-select");
    expect(addBasicPosSelect).toHaveTextContent("添加基本词性");
    expect(screen.queryByLabelText("新增词性")).not.toBeInTheDocument();

    const groupCard = await waitFor(() => {
      const element = container.querySelector(
        `[data-group-id="${content.pos[0]!.form_groups[0]!.id}"]`
      );
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(container.querySelector(".word-form-base-card")).toBeNull();
    expect(screen.queryByText("基准原形与发音")).toBeNull();
    expect(groupCard.querySelectorAll(".v3-concrete-form-row")).toHaveLength(3);
    expect(
      groupCard.querySelector(
        `[data-form-id="${base.id}"] .v3-concrete-form-row`
      )
    ).not.toBeNull();
    expect(
      groupCard.querySelector(
        `[data-form-id="${secondBase.id}"] .v3-concrete-form-row`
      )
    ).not.toBeNull();

    expect(screen.getByText("第 1 组 词形变化")).toBeVisible();
    expect(screen.getByText("词形是否规则变化？")).toBeVisible();
    expect(screen.getByLabelText("收起第 1 组词形变化")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.queryByText("添加词形")).toBeNull();
    expect(screen.getAllByLabelText(/下方添加同类型词形/)).toHaveLength(3);
    expect(container.textContent).not.toMatch(/派生词形|派生词性/);
    expect(container.querySelector(".v3-form-group-tools")).toBeNull();
    expect(
      container.querySelector(
        `[data-group-id="${content.pos[0]!.form_groups[0]!.id}"] [data-form-id="${plural.id}"]`
      )
    ).not.toBeNull();

    fireEvent.click(screen.getByLabelText("收起第 1 组词形变化"));
    expect(screen.getByLabelText("展开第 1 组词形变化")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("词形是否规则变化？")).toBeNull();
    fireEvent.click(screen.getByLabelText("展开第 1 组词形变化"));
    const regularRadios = groupCard.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]'
    );
    fireEvent.click(regularRadios[1]!);
    expect(canonicalValue().pos[0]!.form_groups[0]!.is_regular).toBe(false);
    fireEvent.click(regularRadios[0]!);
    expect(canonicalValue().pos[0]!.form_groups[0]!.is_regular).toBe(true);
  });

  it("以 82203e0 为基准把多词性的删除入口放回 Tab 标签", async () => {
    const { container } = render(<Harness initial={multiPosFixture()} />);

    expect(await screen.findByText("名词")).toBeVisible();
    const deleteNoun = screen.getByLabelText("删除名词");
    const deleteVerb = screen.getByLabelText("删除动词");
    expect(deleteNoun.closest(".ant-tabs-tab")).not.toBeNull();
    expect(deleteVerb.closest(".ant-tabs-tab")).not.toBeNull();
    expect(
      container.querySelector(".v3-pos-tab > .v3-delete-pos-row")
    ).toBeNull();
  });

  it("按实际产品图把原形与其他词形放在同一变化组矩阵", async () => {
    const base = commonFormFixture({
      id: uuidFromInt(741),
      variant_id: uuidFromInt(751),
      spelling: "far",
      pronunciations: [pronunciationFixture({ id: uuidFromInt(754) })]
    });
    const comparative = commonFormFixture({
      id: uuidFromInt(742),
      form_type: "comparative",
      variant_id: uuidFromInt(752),
      spelling: "farther"
    });
    const superlative = commonFormFixture({
      id: uuidFromInt(743),
      form_type: "superlative",
      variant_id: uuidFromInt(753),
      spelling: "farthest"
    });
    const content = formsFixture({
      forms: [base, comparative, superlative],
      groups: [
        group(uuidFromInt(761), [
          { id: uuidFromInt(771), form_id: base.id },
          { id: uuidFromInt(772), form_id: comparative.id },
          { id: uuidFromInt(773), form_id: superlative.id }
        ])
      ],
      pos: "adjective"
    });
    const { container } = render(<Harness initial={content} />);

    const groupCard = await waitFor(() => {
      const element = container.querySelector(
        `[data-group-id="${content.pos[0]!.form_groups[0]!.id}"]`
      );
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(container.querySelector(".word-form-base-card")).toBeNull();
    expect(screen.queryByText("基准原形与发音")).toBeNull();
    expect(
      within(groupCard)
        .getByLabelText("英美拼写无区别")
        .closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(
      groupCard.querySelector(".word-form-matrix-shared-header")
    ).toHaveTextContent("英美共用");
    expect(groupCard.querySelectorAll(".v3-concrete-form-row")).toHaveLength(3);
    expect(
      groupCard.querySelectorAll(".word-form-type-cell .v3-membership-actions")
    ).toHaveLength(3);
    expect(groupCard).toHaveTextContent("发音方式");
    expect(groupCard).toHaveTextContent("字典音标");
    expect(groupCard).toHaveTextContent("实际发音");
    expect(within(groupCard).getAllByLabelText(/播放语音/)).toHaveLength(3);
    expect(within(groupCard).getAllByLabelText(/获取语音/)).toHaveLength(3);
    for (const form of [base, comparative, superlative]) {
      expect(
        groupCard.querySelector(
          `[data-form-id="${form.id}"] .v3-concrete-form-row`
        )
      ).not.toBeNull();
    }

    expect(screen.queryByLabelText("变化组 1 新增词形类型")).toBeNull();
  });

  it("产品图首组显示三行规则，后续组不重复词性级英美规则", async () => {
    const form = commonFormFixture({ spelling: "center" });
    const content = formsFixture({
      forms: [form],
      groups: [
        group(uuidFromInt(774), [{ id: uuidFromInt(775), form_id: form.id }]),
        group(uuidFromInt(776), [{ id: uuidFromInt(777), form_id: form.id }])
      ]
    });
    const { container } = render(<Harness initial={content} />);

    const cards = await waitFor(() => {
      const items = container.querySelectorAll<HTMLElement>(
        ".v3-form-group-card"
      );
      expect(items).toHaveLength(2);
      return items;
    });
    const first = within(cards[0]!);
    const second = within(cards[1]!);
    expect(first.getByText("词形是否规则变化？")).toBeVisible();
    expect(first.getByText("英美拼写是否有区别？")).toBeVisible();
    expect(first.getByText("英美音标是否有区别？")).toBeVisible();
    expect(
      first.getByLabelText("英美拼写无区别").closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(
      first.getByLabelText("英美音标无区别").closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(second.getByText("词形是否规则变化？")).toBeVisible();
    expect(second.queryByText("英美拼写是否有区别？")).toBeNull();
    expect(second.queryByText("英美音标是否有区别？")).toBeNull();
  });

  it("UD 规则独立回显拼写不区分、音标区分", async () => {
    const form = ukUsFormFixture({
      uk: { spelling: "center" },
      us: { spelling: "center" }
    });
    const { container } = render(
      <Harness
        initial={formsFixture({
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "distinguish"
          },
          forms: [form]
        })}
      />
    );

    expect(
      (await screen.findByLabelText("英美拼写无区别")).closest(
        ".ant-radio-wrapper"
      )
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(
      screen.getByLabelText("英美音标有区别").closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(screen.getByLabelText("英美音标无区别")).not.toBeDisabled();
    expect(screen.getByLabelText("原形英式拼写")).toHaveValue("center");
    expect(screen.getByLabelText("原形美式拼写")).toHaveValue("center");
    expect(
      container.querySelector(".v3-dialect-separated-matrix")
    ).not.toBeNull();
    expect(container.querySelector(".word-form-matrix-distinguish")).toBeNull();
    fireEvent.change(screen.getByLabelText("原形英式拼写"), {
      target: { value: "centred" }
    });
    expect(screen.getByLabelText("原形美式拼写")).toHaveValue("centred");
    const updated = formById(canonicalValue(), form.id);
    if (updated.regional_variants.mode !== "uk_us") throw new Error("fixture");
    expect(updated.regional_variants.uk.spelling).toBe("centred");
    expect(updated.regional_variants.us.spelling).toBe("centred");
  });

  it("词性级 UU 切换 DD 并逐条显式映射唯一词形", async () => {
    const base = commonFormFixture({
      id: uuidFromInt(781),
      variant_id: uuidFromInt(791),
      spelling: "far"
    });
    const comparative = commonFormFixture({
      id: uuidFromInt(782),
      form_type: "comparative",
      variant_id: uuidFromInt(792),
      spelling: "farther"
    });
    const generatedIds = Array.from({ length: 8 }, (_, index) =>
      uuidFromInt(801 + index)
    );
    render(
      <Harness
        initial={formsFixture({ forms: [base, comparative], pos: "adjective" })}
        idFactory={uuidSequence(...generatedIds)}
      />
    );

    expect(
      (await screen.findByLabelText("英美拼写无区别")).closest(
        ".ant-radio-wrapper"
      )
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(
      screen.getByLabelText("英美音标无区别").closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(screen.queryByLabelText("原形切换为英式和美式")).toBeNull();
    expect(screen.queryByLabelText("比较级切换为英式和美式")).toBeNull();

    fireEvent.click(screen.getByLabelText("英美拼写有区别"));
    expect(screen.queryByRole("dialog")).toBeNull();

    await waitFor(() =>
      expect(
        screen.getByLabelText("英美拼写有区别").closest(".ant-radio-wrapper")
      ).toHaveClass("ant-radio-wrapper-checked")
    );
    expect(
      screen.getByLabelText("英美音标有区别").closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    expect(screen.getByLabelText("英美音标无区别")).toBeDisabled();
    expect(
      screen.getAllByText("英式英语 · BrE", { exact: true })[0]
    ).toBeVisible();
    expect(
      screen.getAllByText("美式英语 · AmE", { exact: true })[0]
    ).toBeVisible();
    const converted = canonicalValue().pos[0]!.forms;
    expect(converted.map((form) => form.id)).toEqual([base.id, comparative.id]);
    expect(
      converted.every((form) => form.regional_variants.mode === "uk_us")
    ).toBe(true);
    expect(canonicalValue().pos[0]!.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
  });

  it("混合历史草稿显示待统一并可一键按规则归一化", async () => {
    const common = commonFormFixture({ id: uuidFromInt(811) });
    const regional = ukUsFormFixture({
      id: uuidFromInt(812),
      form_type: "comparative"
    });
    render(
      <Harness
        initial={formsFixture({
          forms: [common, regional],
          pos: "adjective"
        })}
      />
    );

    expect(await screen.findByText("当前词性的英美结构待统一")).toBeVisible();
    expect(
      screen.getByLabelText("英美拼写有区别").closest(".ant-radio-wrapper")
    ).toHaveClass("ant-radio-wrapper-checked");
    fireEvent.click(screen.getByLabelText("英美拼写无区别"));
    await waitFor(() =>
      expect(screen.queryByText("当前词性的英美结构待统一")).toBeNull()
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      canonicalValue().pos[0]!.forms.every(
        (item) => item.regional_variants.mode === "uk_us"
      )
    ).toBe(true);
    expect(canonicalValue().pos[0]!.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "distinguish"
    });
  });

  it("I02 完整显示多 POS/多组/同类型多行，共享 form 同步编辑但不复制", async () => {
    const content = multiPosFixture();
    const sharedId = content.pos[0]!.forms[0]!.id;
    const secondId = content.pos[0]!.forms[1]!.id;
    const { container } = render(<Harness initial={content} />);

    await waitFor(() =>
      expect(container.querySelectorAll(".word-form-group-card")).toHaveLength(
        2
      )
    );
    expect(
      container.querySelectorAll(
        `.word-form-group-card [data-form-id="${sharedId}"] .v3-concrete-form-row`
      )
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(
        `.word-form-group-card [data-form-id="${secondId}"] .v3-concrete-form-row`
      )
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".word-form-group-card .v3-concrete-form-row")
    ).toHaveLength(3);
    expect(await screen.findByText("名词")).toBeInTheDocument();
    expect(screen.getByText("动词")).toBeInTheDocument();

    const sharedInput = screen.getByLabelText("原形 1通用拼写");
    fireEvent.change(sharedInput, { target: { value: "shared-edited" } });

    expect(screen.getByLabelText("原形 1通用拼写")).toHaveValue(
      "shared-edited"
    );
    expect(screen.getByLabelText("原形通用拼写")).toHaveValue("shared-edited");
    expect(screen.getByLabelText("原形 2通用拼写")).toHaveValue("second-base");
    expect(content.pos[0]!.forms).toHaveLength(2);
    expect(canonicalValue().pos[0]!.forms).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("从变化组 2 移除词形 1"));
    expect(canonicalValue().pos[0]!.forms).toHaveLength(2);
    expect(canonicalValue().pos[0]!.form_groups[1]!.members).toEqual([]);
  });

  it("I02 使用 form UUID key，membership 重排时输入节点与焦点保持", async () => {
    const content = multiPosFixture();
    const formId = content.pos[0]!.forms[0]!.id;
    const groupId = content.pos[0]!.form_groups[0]!.id;
    const { container } = render(<Harness initial={content} />);
    const target = screen.getByLabelText("原形 1通用拼写");
    target.focus();
    const row = target.closest(`[data-form-id="${formId}"]`);

    await waitFor(() =>
      expect(screen.getByLabelText("下移变化组 1 的词形 1")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText("下移变化组 1 的词形 1"));

    expect(document.activeElement).toBe(target);
    expect(target.closest(`[data-form-id="${formId}"]`)).toBe(row);
    const rows = container.querySelectorAll(
      `[data-group-id="${groupId}"] .v3-membership-row[data-form-id]`
    );
    expect(rows[1]).toHaveAttribute("data-form-id", formId);
  });

  it("I03 三态切换按 V2 直接转换，不弹窗且保留 form UUID", () => {
    const form = commonFormFixture({
      pronunciations: [
        pronunciationFixture({ id: uuidFromInt(301) }),
        pronunciationFixture({ id: uuidFromInt(302), style: "strong" })
      ]
    });
    const nextIds = [401, 402, 403, 404, 405, 406, 407, 408, 409].map(
      uuidFromInt
    );
    render(
      <Harness
        initial={formsFixture({ forms: [form] })}
        idFactory={uuidSequence(...nextIds)}
      />
    );

    fireEvent.click(screen.getByLabelText("英美拼写有区别"));
    expect(screen.queryByRole("dialog")).toBeNull();

    const converted = formById(canonicalValue(), form.id);
    expect(converted.id).toBe(form.id);
    expect(converted.regional_variants).toMatchObject({
      mode: "uk_us",
      uk: {
        id: nextIds[0],
        spelling: "centre",
        pronunciations: [{ id: nextIds[1] }, { id: nextIds[2] }]
      },
      us: {
        id: nextIds[3],
        spelling: "centre",
        pronunciations: [{ id: nextIds[4] }, { id: nextIds[5] }]
      }
    });

    expect(screen.getByLabelText("英美音标无区别")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("英美拼写无区别"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(formById(canonicalValue(), form.id)).toMatchObject({
      id: form.id,
      regional_variants: {
        mode: "uk_us",
        uk: { spelling: "centre" },
        us: { spelling: "centre" }
      }
    });
    expect(canonicalValue().pos[0]!.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "distinguish"
    });

    fireEvent.click(screen.getByLabelText("英美音标无区别"));
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(formById(canonicalValue(), form.id)).toMatchObject({
      id: form.id,
      regional_variants: {
        mode: "common",
        common: {
          id: nextIds[6],
          spelling: "centre",
          pronunciations: [{ id: nextIds[7] }, { id: nextIds[8] }]
        }
      }
    });
  });

  it("#126 最后词性与最后词形不可删除，新增第二个词形后恢复删除", async () => {
    const form = commonFormFixture();
    const content = formsFixture({ forms: [form] });
    const rendered = render(<Harness initial={content} />);

    const lastFormDelete =
      await screen.findByLabelText("从变化组 1 移除词形 1");
    expect(lastFormDelete).toBeDisabled();
    expect(lastFormDelete).toHaveAttribute("title", "每个词性至少保留一个词形");
    expect(screen.queryByLabelText("删除名词")).toBeNull();
    fireEvent.click(screen.getByLabelText("管理第 1 组词形变化"));
    const lastGroupDelete = await screen.findByText("至少保留一个词形");
    expect(lastGroupDelete.closest("li")).toHaveClass(
      "ant-dropdown-menu-item-disabled"
    );
    expect(formById(canonicalValue(), form.id)).toBeDefined();

    const second = commonFormFixture({ id: uuidFromInt(450) });
    rendered.rerender(
      <Harness
        key="multiple-forms"
        initial={formsFixture({ forms: [form, second] })}
      />
    );
    fireEvent.click(await screen.findByLabelText("从变化组 1 移除词形 2"));
    expect(screen.getByText("此词形仅在当前变化组中使用")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("删除词形及相关发音"));
    expect(canonicalValue().pos[0]!.forms).toEqual([form]);
  });

  it("#213/#215 最后使用组只显示产品文案，危险删除仍移除完整词形", async () => {
    const keeper = commonFormFixture();
    const removed = commonFormFixture({ id: uuidFromInt(451) });
    render(<Harness initial={formsFixture({ forms: [keeper, removed] })} />);

    fireEvent.click(await screen.findByLabelText("从变化组 1 移除词形 2"));

    const alert = screen
      .getByText("此词形仅在当前变化组中使用")
      .closest(".ant-alert");
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent(
      "不能只从当前组移除。若不再需要此词形，可将它及相关发音一并删除。"
    );
    expect(alert).not.toHaveTextContent(/孤立词形|membership|使用位置/);
    const deleteButton = screen.getByLabelText("删除词形及相关发音");
    expect(deleteButton).toHaveTextContent("删除词形");
    expect(deleteButton.tagName).toBe("BUTTON");
    expect(deleteButton).not.toBeDisabled();

    fireEvent.click(deleteButton);

    const next = canonicalValue();
    expect(next.pos[0]!.forms).toEqual([keeper]);
    expect(JSON.stringify(next)).not.toContain(removed.id);
    expect(JSON.stringify(next)).not.toContain(
      removed.regional_variants.common.id
    );
    expect(JSON.stringify(next)).not.toContain(
      removed.regional_variants.common.pronunciations[0]!.id
    );
  });

  it("#214 共享词形仍只从当前变化组移除并保留 canonical form", async () => {
    const shared = commonFormFixture({ id: uuidFromInt(452) });
    const keeper = commonFormFixture({ id: uuidFromInt(453) });
    const firstMembership = uuidFromInt(454);
    const keeperMembership = uuidFromInt(455);
    const secondMembership = uuidFromInt(456);
    const initial = formsFixture({
      forms: [shared, keeper],
      groups: [
        group(uuidFromInt(457), [
          { id: firstMembership, form_id: shared.id },
          { id: keeperMembership, form_id: keeper.id }
        ]),
        group(uuidFromInt(458), [{ id: secondMembership, form_id: shared.id }])
      ]
    });
    render(<Harness initial={initial} />);

    fireEvent.click(await screen.findByLabelText("从变化组 1 移除词形 1"));

    const next = canonicalValue();
    expect(screen.queryByText("此词形仅在当前变化组中使用")).toBeNull();
    expect(next.pos[0]!.forms).toEqual(initial.pos[0]!.forms);
    expect(next.pos[0]!.form_groups[0]!.members).toEqual([
      { id: keeperMembership, form_id: keeper.id }
    ]);
    expect(next.pos[0]!.form_groups[1]).toEqual(initial.pos[0]!.form_groups[1]);
  });

  it("#216 关闭提示表示取消并完整保留 draft", async () => {
    const keeper = commonFormFixture();
    const retained = commonFormFixture({ id: uuidFromInt(459) });
    render(<Harness initial={formsFixture({ forms: [keeper, retained] })} />);
    const before = canonicalValue();

    fireEvent.click(await screen.findByLabelText("从变化组 1 移除词形 2"));
    const closeButton = screen.getByLabelText("取消删除词形并保留");
    expect(closeButton.tagName).toBe("BUTTON");
    expect(closeButton.tabIndex).toBe(0);

    fireEvent.click(closeButton);

    expect(screen.queryByText("此词形仅在当前变化组中使用")).toBeNull();
    expect(canonicalValue()).toEqual(before);
  });

  it("I04 多发音使用 field.key，编辑、新增与删除保持 pronunciation UUID 和顺序", () => {
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
    const rows = [
      ...container.querySelectorAll<HTMLElement>("[data-pronunciation-id]")
    ];
    expect(rows.map((row) => row.dataset.pronunciationId)).toEqual([
      pronunciations[0]!.id,
      pronunciations[1]!.id,
      pronunciations[2]!.id
    ]);
    expect(screen.getAllByLabelText(/拖动第 \d+ 条发音/)).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("第 2 条发音的实际发音"), {
      target: { value: "two-edited" }
    });
    fireEvent.click(screen.getByLabelText("在第 3 条后新增发音"));
    expect(screen.getByLabelText("第 4 条发音的实际发音")).toHaveValue("");
    fireEvent.click(screen.getByLabelText("删除第 3 条发音"));

    const variant = formById(canonicalValue(), form.id).regional_variants;
    if (variant.mode !== "common") throw new Error("expected common");
    expect(variant.common.pronunciations.map((item) => item.id)).toEqual([
      pronunciations[0]!.id,
      pronunciations[1]!.id,
      addedId
    ]);
    expect(variant.common.pronunciations[1]!.actual_pron).toBe("two-edited");
  });

  it("I08 draft 空态可编辑但不误报完成；发布问题只显示简短状态", () => {
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
    expect(
      screen.getByText(
        "已按最近一次发布检查结果标出对应字段；修改后请重新检查以更新状态。"
      )
    ).toBeInTheDocument();

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
    expect(screen.getByLabelText("原形通用拼写")).toHaveAttribute(
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
    expect(screen.getByLabelText("新增名词变化组")).toHaveTextContent(
      "增加一组词性变化"
    );
    expect(screen.queryByLabelText(/noun/)).toBeNull();
    expect(screen.queryByText("规则组")).toBeNull();

    const catalogWithoutDerived = {
      ...partOfSpeechCatalogFixture.items[0]!,
      allowed_form_types: []
    };
    rerender(
      <AntApp>
        <V3PosTab
          content={emptyGroups}
          idFactory={() => uuidFromInt(985)}
          issues={[]}
          onChange={onChange}
          pos={emptyGroups.pos[0]!}
          posCatalog={catalogWithoutDerived}
        />
      </AntApp>
    );
    expect(screen.queryByText("草稿可暂时不添加变化组")).toBeNull();
    expect(screen.queryByLabelText(/新增.*变化组/u)).toBeNull();
  });

  it("目录没有额外词形时仍保留并显示历史词形变化组", () => {
    const derived = commonFormFixture({
      id: uuidFromInt(975),
      form_type: "plural",
      spelling: "centres"
    });
    const content = formsFixture({ forms: [derived] });
    const nounCatalog = partOfSpeechCatalogFixture.items.find(
      (item) => item.code === "noun"
    )!;

    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3PosTab
            content={content}
            idFactory={() => uuidFromInt(976)}
            issues={[]}
            onChange={() => undefined}
            pos={content.pos[0]!}
            posCatalog={{
              ...nounCatalog,
              allowed_form_types: [],
              default_form_types: []
            }}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(screen.getByText("第 1 组 词形变化")).toBeVisible();
    expect(screen.queryByText("当前词性无需其他词形变化")).toBeNull();
    expect(screen.getByLabelText("复数通用拼写")).toHaveValue("centres");
    expect(document.body.textContent).not.toMatch(/基本词性|派生词形|派生词性/);
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
        <PronunciationPreviewProvider>
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
        </PronunciationPreviewProvider>
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
    const keeper = commonFormFixture({ id: uuidFromInt(703) });
    const displayed = formsFixture({
      forms: [form, keeper],
      groups: [
        {
          id: uuidFromInt(704),
          is_regular: true,
          members: [{ id: uuidFromInt(705), form_id: form.id }]
        }
      ]
    });
    const displayedGroup = displayed.pos[0]!.form_groups[0]!;
    const stale = formsFixture({ forms: [form, keeper], groups: [] });
    const onChange = vi.fn();
    const { rerender } = render(
      <AntApp>
        <PronunciationPreviewProvider>
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
        </PronunciationPreviewProvider>
      </AntApp>
    );

    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("此词形仅在当前变化组中使用")).toBeNull();

    rerender(
      <AntApp>
        <PronunciationPreviewProvider>
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
        </PronunciationPreviewProvider>
      </AntApp>
    );
    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    expect(screen.getByText("此词形仅在当前变化组中使用")).toBeInTheDocument();

    const missingForm = formsFixture({ forms: [], groups: [] });
    rerender(
      <AntApp>
        <PronunciationPreviewProvider>
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
        </PronunciationPreviewProvider>
      </AntApp>
    );
    fireEvent.click(screen.getByLabelText("删除词形及相关发音"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText("此词形仅在当前变化组中使用")).toBeNull();

    rerender(
      <AntApp>
        <PronunciationPreviewProvider>
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
        </PronunciationPreviewProvider>
      </AntApp>
    );
    fireEvent.click(screen.getByLabelText("从变化组 1 移除词形 1"));
    fireEvent.click(screen.getByLabelText("取消删除词形并保留"));
    expect(screen.queryByText("此词形仅在当前变化组中使用")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("覆盖 UK/US 双区域与字段 issue", () => {
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
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={content}
            dialectRules={{
              spelling_mode: "distinguish",
              phonetic_mode: "distinguish"
            }}
            form={form}
            idFactory={() => uuidFromInt(899)}
            issues={[ukIssue]}
            membershipCount={0}
            onChange={onChange}
          />
        </PronunciationPreviewProvider>
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
  });

  it("短语词形分别维护英式与美式成分用词", () => {
    const form = ukUsFormFixture({ id: uuidFromInt(850) });
    const content = formsFixture({ forms: [form] });
    const onChange = vi.fn();
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={content}
            dialectRules={{
              spelling_mode: "distinguish",
              phonetic_mode: "distinguish"
            }}
            entryKind="phrase"
            form={form}
            idFactory={() => uuidFromInt(851)}
            issues={[]}
            membershipCount={0}
            onChange={onChange}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(screen.getAllByText("成分用词")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("为centre添加成分用词"));
    const next = onChange.mock.calls[0]![0] as DraftFormsStepContentV3;
    const regional = next.pos[0]!.forms[0]!.regional_variants;
    expect(regional.mode).toBe("uk_us");
    if (regional.mode !== "uk_us") throw new Error("expected uk/us variants");
    expect(regional.uk.component_usages).toEqual([
      { state: "unresolved", id: uuidFromInt(851), literal: "" }
    ]);
    expect(regional.us.component_usages).toEqual([]);
  });

  it("短语成分可查询并选择已发布词义，完整写入目标快照", async () => {
    const componentId = uuidFromInt(860);
    const form = ukUsFormFixture({
      id: uuidFromInt(861),
      uk: {
        component_usages: [
          { state: "unresolved", id: componentId, literal: "centre" },
          {
            state: "unresolved",
            id: uuidFromInt(8760),
            literal: "other"
          }
        ]
      }
    });
    componentLookupState.resolve.mockResolvedValue({
      schema_version: 3,
      sentence_hash: "hash",
      discovery_generation: 2,
      completeness: "complete",
      range_results: [
        {
          source_segments: [{ start: 0, end: 6, surface: "centre" }],
          segments_fingerprint: "segment",
          normalized_surface: "centre",
          published_total: 1,
          draft_matches: [],
          published_matches: [
            {
              entry_id: uuidFromInt(862),
              publication_id: uuidFromInt(863),
              pos_id: uuidFromInt(864),
              base_form_id: uuidFromInt(865),
              headword: "centre",
              pos: "noun",
              matched_form_id: uuidFromInt(866),
              matched_variant_id: uuidFromInt(867),
              matched_dialect: "uk",
              matched_form_type: "base",
              component_usages: [],
              matches: [],
              senses: [
                {
                  sense_id: uuidFromInt(868),
                  publication_id: uuidFromInt(863),
                  pos_id: uuidFromInt(864),
                  base_form_id: uuidFromInt(865),
                  level: "A2",
                  gloss: "中心"
                },
                {
                  sense_id: uuidFromInt(8680),
                  publication_id: uuidFromInt(863),
                  pos_id: uuidFromInt(864),
                  base_form_id: uuidFromInt(865),
                  level: "A2",
                  gloss: ""
                }
              ]
            }
          ]
        }
      ]
    });
    const onChange = vi.fn();
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={formsFixture({ forms: [form] })}
            dialectRules={{
              spelling_mode: "distinguish",
              phonetic_mode: "distinguish"
            }}
            entryKind="phrase"
            form={form}
            idFactory={() => uuidFromInt(869)}
            issues={[]}
            membershipCount={0}
            onChange={onChange}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    fireEvent.click(screen.getAllByRole("button", { name: "查找词义" })[0]!);
    const select = await screen.findByLabelText("选择第1个成分的词义");
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText(/centre · 中心/));
    const next = onChange.mock.calls[0]![0] as DraftFormsStepContentV3;
    const regional = next.pos[0]!.forms[0]!.regional_variants;
    if (regional.mode !== "uk_us") throw new Error("expected uk/us variants");
    expect(regional.uk.component_usages?.[0]).toMatchObject({
      state: "resolved",
      id: componentId,
      literal: "centre",
      target_word_id: uuidFromInt(862),
      target_publication_id: uuidFromInt(863),
      target_sense_id: uuidFromInt(868),
      target_variant_id: uuidFromInt(867),
      target_headword: "centre",
      target_gloss: "中心"
    });
    expect(regional.uk.component_usages?.[1]).toEqual({
      state: "unresolved",
      id: uuidFromInt(8760),
      literal: "other"
    });
  });

  it("短语成分无匹配或查询失败时保留输入，并支持编辑与删除", async () => {
    const componentId = uuidFromInt(870);
    const form = commonFormFixture({
      id: uuidFromInt(871),
      spelling: "center phrase"
    });
    form.regional_variants.common.component_usages = [
      { state: "unresolved", id: componentId, literal: "center" }
    ];
    const onChange = vi.fn();
    const view = render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={formsFixture({ forms: [form] })}
            dialectRules={{
              spelling_mode: "unified",
              phonetic_mode: "unified"
            }}
            entryKind="phrase"
            form={form}
            idFactory={() => uuidFromInt(872)}
            issues={[]}
            membershipCount={0}
            onChange={onChange}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    fireEvent.click(screen.getByRole("button", { name: "查找词义" }));
    expect(
      await screen.findByText(
        "未找到可关联的已发布词义；当前成分将继续保留为待选择状态。"
      )
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("第1个成分用词"), {
      target: { value: "central" }
    });
    expect(
      (onChange.mock.calls.at(-1)![0] as DraftFormsStepContentV3).pos[0]!
        .forms[0]!.regional_variants
    ).toMatchObject({
      common: {
        component_usages: [
          { state: "unresolved", id: componentId, literal: "central" }
        ]
      }
    });
    fireEvent.click(screen.getByLabelText("删除第1个成分用词"));
    expect(
      (onChange.mock.calls.at(-1)![0] as DraftFormsStepContentV3).pos[0]!
        .forms[0]!.regional_variants
    ).toMatchObject({ common: { component_usages: [] } });
    view.unmount();

    componentLookupState.resolve.mockRejectedValueOnce(new Error("offline"));
    const failedForm = commonFormFixture({ id: uuidFromInt(873) });
    failedForm.regional_variants.common.component_usages = [
      { state: "unresolved", id: uuidFromInt(874), literal: "center" }
    ];
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={formsFixture({ forms: [failedForm] })}
            dialectRules={{
              spelling_mode: "unified",
              phonetic_mode: "unified"
            }}
            entryKind="phrase"
            form={failedForm}
            idFactory={() => uuidFromInt(875)}
            issues={[]}
            membershipCount={0}
            onChange={vi.fn()}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );
    fireEvent.click(screen.getByRole("button", { name: "查找词义" }));
    expect(
      await screen.findByText("词义查询失败，请稍后重试；当前编辑内容未丢失。")
    ).toBeVisible();
  });

  it("已解析成分展示完整快照，修改词面后回到待选择状态", () => {
    const form = commonFormFixture({ id: uuidFromInt(876) });
    form.regional_variants.common.component_usages = [
      {
        state: "resolved",
        id: uuidFromInt(877),
        literal: "center",
        target_word_id: uuidFromInt(878),
        target_publication_id: uuidFromInt(879),
        target_pos_id: uuidFromInt(880),
        target_base_form_id: uuidFromInt(881),
        target_sense_id: uuidFromInt(882),
        target_form_id: uuidFromInt(883),
        target_variant_id: uuidFromInt(884),
        target_dialect: "us",
        target_form_type: "base",
        target_headword: "center",
        target_gloss: "中心"
      }
    ];
    const onChange = vi.fn();
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={formsFixture({ forms: [form] })}
            dialectRules={{
              spelling_mode: "unified",
              phonetic_mode: "unified"
            }}
            entryKind="phrase"
            form={form}
            idFactory={() => uuidFromInt(885)}
            issues={[]}
            membershipCount={0}
            onChange={onChange}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(screen.getByText("已关联词义")).toBeVisible();
    expect(screen.getByText(/center · 中心 · 美式 · 原形/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "更换词义" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("第1个成分用词"), {
      target: { value: "central" }
    });
    expect(
      (onChange.mock.calls[0]![0] as DraftFormsStepContentV3).pos[0]!.forms[0]!
        .regional_variants
    ).toMatchObject({
      common: {
        component_usages: [
          { state: "unresolved", id: uuidFromInt(877), literal: "central" }
        ]
      }
    });
  });

  it("统一拼写双侧仍各自维护组件，空词面与不完整候选不会伪关联", async () => {
    const form = ukUsFormFixture({
      id: uuidFromInt(886),
      uk: { spelling: "" },
      us: { spelling: "" }
    });
    delete form.regional_variants.uk.component_usages;
    form.regional_variants.us.component_usages = [
      { state: "unresolved", id: uuidFromInt(887), literal: "center" }
    ];
    componentLookupState.resolve.mockResolvedValueOnce({
      schema_version: 3,
      sentence_hash: "hash",
      discovery_generation: 1,
      completeness: "complete",
      range_results: [
        {
          source_segments: [{ start: 0, end: 6, surface: "center" }],
          segments_fingerprint: "center",
          normalized_surface: "center",
          published_total: 1,
          draft_matches: [],
          published_matches: [
            {
              entry_id: uuidFromInt(888),
              publication_id: uuidFromInt(889),
              pos_id: uuidFromInt(890),
              base_form_id: uuidFromInt(891),
              headword: "center",
              pos: "noun",
              matches: [],
              component_usages: [],
              senses: []
            }
          ]
        }
      ]
    });
    const onChange = vi.fn();
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={formsFixture({ forms: [form] })}
            dialectRules={{
              spelling_mode: "unified",
              phonetic_mode: "distinguish"
            }}
            entryKind="phrase"
            form={form}
            idFactory={() => uuidFromInt(892)}
            issues={[]}
            membershipCount={0}
            onChange={onChange}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(screen.getByText("英美共用")).toBeVisible();
    expect(screen.getAllByText("成分用词")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("词形英美共用拼写"), {
      target: { value: "center phrase" }
    });
    expect(onChange).toHaveBeenCalled();
    fireEvent.click(screen.getAllByLabelText("为当前词形添加成分用词")[0]!);
    expect(onChange).toHaveBeenCalled();
    fireEvent.click(
      screen.getAllByRole("button", { name: "查找词义" }).at(-1)!
    );
    expect(
      await screen.findByText(
        "未找到可关联的已发布词义；当前成分将继续保留为待选择状态。"
      )
    ).toBeVisible();
  });

  it("英美两侧已有独立成分时 UI 明确阻止静默合并并可关闭提示", () => {
    const form = ukUsFormFixture({ id: uuidFromInt(893) });
    form.regional_variants.uk.component_usages = [
      { state: "unresolved", id: uuidFromInt(894), literal: "centre" }
    ];
    form.regional_variants.us.component_usages = [
      { state: "unresolved", id: uuidFromInt(895), literal: "center" }
    ];
    const content = formsFixture({ forms: [form] });
    content.pos[0]!.dialect_rules = {
      spelling_mode: "unified",
      phonetic_mode: "distinguish"
    };
    const onChange = vi.fn();
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3PosTab
            content={content}
            entryKind="phrase"
            idFactory={() => uuidFromInt(896)}
            issues={[]}
            onChange={onChange}
            pos={content.pos[0]!}
            posCatalog={partOfSpeechCatalogFixture.items[0]}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    fireEvent.click(screen.getByLabelText("英美音标无区别"));
    expect(screen.getByText("暂不能合并英美成分配置")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByText("暂不能合并英美成分配置")).toBeNull();
  });

  it("发现 capability 关闭时禁用成分查询但保留 unresolved 手工编辑", () => {
    const form = commonFormFixture({ id: uuidFromInt(897) });
    form.regional_variants.common.component_usages = [
      { state: "unresolved", id: uuidFromInt(898), literal: "center" }
    ];
    const content = formsFixture({ forms: [form] });
    const onChange = vi.fn();
    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3ConcreteFormRow
            content={content}
            dialectRules={{
              spelling_mode: "unified",
              phonetic_mode: "unified"
            }}
            entryKind="phrase"
            form={form}
            idFactory={() => uuidFromInt(899)}
            issues={[]}
            membershipCount={0}
            onChange={onChange}
            sentenceTargetDiscoveryEnabled={false}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(
      screen.getByText("当前未开启词义查询，仍可手工维护成分用词并保存。")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "查找词义" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("第1个成分用词"), {
      target: { value: "central" }
    });
    const next = onChange.mock.calls.at(-1)![0] as DraftFormsStepContentV3;
    const regional = next.pos[0]!.forms[0]!.regional_variants;
    if (regional.mode !== "common") throw new Error("expected common variant");
    expect(regional.common.component_usages).toEqual([
      { state: "unresolved", id: uuidFromInt(898), literal: "central" }
    ]);
    expect(componentLookupState.resolve).not.toHaveBeenCalled();
  });

  it("覆盖 UK 发音缺省 style、字段编辑、增删与 issue", () => {
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
        <PronunciationPreviewProvider>
          <V3PronunciationList
            content={content}
            idFactory={() => addedId}
            issues={[issue]}
            onChange={onChange}
            variant={form.regional_variants.uk}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(screen.getAllByLabelText(/拖动第 \d+ 条发音/)).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("第 1 条发音的实际发音")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("第 1 条发音的字典音标")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByLabelText("第 1 条发音的发音方式")).toHaveValue("");
    expect(screen.queryByLabelText("新增发音")).toBeNull();
    expect(screen.getAllByLabelText(/在第 \d+ 条后新增发音/)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("第 2 条发音的字典音标"), {
      target: { value: "edited-dict" }
    });
    fireEvent.change(screen.getByLabelText("第 2 条发音的实际发音"), {
      target: { value: "edited-actual" }
    });
    fireEvent.mouseDown(screen.getByLabelText("第 2 条发音的发音方式"));
    fireEvent.click(screen.getAllByText("弱读").at(-1)!);
    fireEvent.click(screen.getByLabelText("在第 2 条后新增发音"));
    fireEvent.click(screen.getByLabelText("删除第 2 条发音"));

    expect(onChange).toHaveBeenCalledTimes(5);
    const added = onChange.mock.calls[3]![0] as DraftFormsStepContentV3;
    const addedForm = added.pos[0]!.forms[0]!;
    if (addedForm.regional_variants.mode !== "uk_us")
      throw new Error("fixture");
    expect(addedForm.regional_variants.uk.pronunciations.at(-1)).toEqual({
      id: addedId,
      dict_phonetic: "",
      actual_pron: "",
      style: "normal"
    });
    const removed = onChange.mock.calls[4]![0] as DraftFormsStepContentV3;
    const removedForm = removed.pos[0]!.forms[0]!;
    if (removedForm.regional_variants.mode !== "uk_us")
      throw new Error("fixture");
    expect(
      removedForm.regional_variants.uk.pronunciations.some(
        (item) => item.id === second.id
      )
    ).toBe(false);
  });

  it("把发布检查的发音方式与字典音标问题映射为各自短帮助文案", () => {
    const pronunciation = pronunciationFixture({
      id: uuidFromInt(905),
      dict_phonetic: "",
      style: undefined
    });
    const form = commonFormFixture({ pronunciations: [pronunciation] });
    const content = formsFixture({ forms: [form] });
    if (form.regional_variants.mode !== "common") throw new Error("fixture");
    const issues: V3DraftValidationIssue[] = [
      {
        schema_version: 3,
        step: "forms",
        node_id: pronunciation.id,
        field: "style",
        code: "pronunciation_required",
        message: "pronunciation is incomplete",
        node_location: {
          node_role: "pronunciation",
          ancestor_node_ids: [content.pos[0]!.pos_id, form.id],
          pos_id: content.pos[0]!.pos_id,
          form_id: form.id,
          variant_id: form.regional_variants.common.id,
          pronunciation_id: pronunciation.id
        }
      },
      {
        schema_version: 3,
        step: "forms",
        node_id: pronunciation.id,
        field: "dict_phonetic",
        code: "pronunciation_required",
        message: "pronunciation is incomplete",
        node_location: {
          node_role: "pronunciation",
          ancestor_node_ids: [content.pos[0]!.pos_id, form.id],
          pos_id: content.pos[0]!.pos_id,
          form_id: form.id,
          variant_id: form.regional_variants.common.id,
          pronunciation_id: pronunciation.id
        }
      }
    ];

    render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3PronunciationList
            content={content}
            idFactory={() => uuidFromInt(906)}
            issues={issues}
            onChange={() => undefined}
            variant={form.regional_variants.common}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(
      screen.getByLabelText("第 1 条发音的发音方式").closest(".ant-select")
    ).toHaveClass("ant-select-status-error");
    expect(screen.getByText("请选择发音方式")).toBeVisible();
    expect(screen.getByLabelText("第 1 条发音的字典音标")).toHaveClass(
      "ant-input-status-error"
    );
    expect(screen.getByText("请填写字典音标")).toBeVisible();
  });

  it("#109 多发音显示拖动手柄并按拖放结果更新 wire 顺序", () => {
    const first = pronunciationFixture({
      id: uuidFromInt(921),
      dict_phonetic: "first-dict",
      actual_pron: "first-actual"
    });
    const second = pronunciationFixture({
      id: uuidFromInt(922),
      dict_phonetic: "second-dict",
      actual_pron: "second-actual"
    });
    const form = ukUsFormFixture({
      id: uuidFromInt(923),
      uk: { pronunciations: [first, second] }
    });
    const content = formsFixture({ forms: [form] });
    const onChange = vi.fn();
    const { container } = render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3PronunciationList
            content={content}
            idFactory={() => uuidFromInt(924)}
            issues={[]}
            onChange={onChange}
            variant={form.regional_variants.uk}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );
    const handles = screen.getAllByLabelText(/拖动第 \d+ 条发音/);
    expect(handles).toHaveLength(2);
    expect(handles[0]!.querySelector(".anticon-holder")).not.toBeNull();
    expect(handles.every((handle) => !handle.hasAttribute("disabled"))).toBe(
      true
    );
    expect(
      [
        ...container.querySelectorAll<HTMLElement>("[data-pronunciation-id]")
      ].map((row) => row.dataset.pronunciationId)
    ).toEqual([first.id, second.id]);

    const store = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types: ["application/x-tsz-pronunciation"],
      setData: (type: string, data: string) => store.set(type, data),
      getData: (type: string) => store.get(type) ?? "",
      setDragImage: vi.fn()
    };
    const target = handles[1]!.closest(".word-pronunciation-editor")!;
    fireEvent.dragStart(handles[0]!, { dataTransfer });
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass("is-drag-over-after");
    fireEvent.dragLeave(target, { dataTransfer });
    expect(target).not.toHaveClass("is-drag-over-after");
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(handles[0]!, { dataTransfer });

    const reordered = onChange.mock.calls.at(-1)![0] as DraftFormsStepContentV3;
    const reorderedForm = reordered.pos[0]!.forms[0]!;
    if (reorderedForm.regional_variants.mode !== "uk_us") {
      throw new Error("fixture");
    }
    expect(
      reorderedForm.regional_variants.uk.pronunciations.map((item) => item.id)
    ).toEqual([second.id, first.id]);

    const callsAfterDrag = onChange.mock.calls.length;
    const keyboardHandles = screen.getAllByLabelText(/拖动第 \d+ 条发音/);
    fireEvent.keyDown(keyboardHandles[0]!, {
      key: "ArrowDown",
      code: "ArrowDown"
    });
    fireEvent.keyDown(keyboardHandles[1]!, {
      key: "ArrowUp",
      code: "ArrowUp"
    });
    expect(onChange.mock.calls.length).toBeGreaterThan(callsAfterDrag);
    fireEvent.keyDown(keyboardHandles[0]!, { key: "ArrowUp", code: "ArrowUp" });
    fireEvent.keyDown(keyboardHandles[1]!, {
      key: "ArrowDown",
      code: "ArrowDown"
    });
    expect(onChange.mock.calls.length).toBeGreaterThan(callsAfterDrag);
    const callsAfterKeyboard = onChange.mock.calls.length;

    const firstRow = keyboardHandles[0]!.closest(".word-pronunciation-editor")!;
    const secondRow = keyboardHandles[1]!.closest(
      ".word-pronunciation-editor"
    )!;
    fireEvent.dragStart(keyboardHandles[1]!, { dataTransfer });
    fireEvent.dragOver(firstRow, { dataTransfer });
    expect(firstRow).toHaveClass("is-drag-over-before");
    fireEvent.dragLeave(firstRow, { dataTransfer });
    fireEvent.dragEnd(keyboardHandles[1]!, { dataTransfer });
    expect(secondRow).not.toHaveClass("is-dragging");
    fireEvent.dragOver(firstRow, {
      dataTransfer: { ...dataTransfer, types: ["text/plain"] }
    });
    expect(firstRow).not.toHaveClass("is-drag-over");
    fireEvent.drop(firstRow, {
      dataTransfer: { ...dataTransfer, getData: () => "not-json" }
    });
    fireEvent.drop(firstRow, {
      dataTransfer: { ...dataTransfer, getData: () => "" }
    });
    fireEvent.drop(firstRow, {
      dataTransfer: {
        ...dataTransfer,
        getData: () => JSON.stringify({ scope: "other", index: 1 })
      }
    });
    fireEvent.drop(firstRow, {
      dataTransfer: {
        ...dataTransfer,
        getData: () =>
          JSON.stringify({ scope: form.regional_variants.uk.id, index: -1 })
      }
    });
    expect(onChange.mock.calls.length).toBe(callsAfterKeyboard);
  });

  it("覆盖 canonical rerender 时发音列表瞬态缺失与空态", () => {
    const pronunciation = pronunciationFixture({ id: uuidFromInt(951) });
    const form = commonFormFixture({ pronunciations: [pronunciation] });
    const content = formsFixture({ forms: [form] });
    const onChange = vi.fn();
    const { rerender } = render(
      <AntApp>
        <PronunciationPreviewProvider>
          <V3PronunciationList
            content={content}
            idFactory={() => uuidFromInt(952)}
            issues={[]}
            onChange={onChange}
            variant={form.regional_variants.common}
          />
        </PronunciationPreviewProvider>
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
        <PronunciationPreviewProvider>
          <V3PronunciationList
            content={emptyContent}
            idFactory={() => uuidFromInt(952)}
            issues={[]}
            onChange={onChange}
            variant={emptyForm.regional_variants.common}
          />
        </PronunciationPreviewProvider>
      </AntApp>
    );

    expect(screen.getByText("暂无发音")).toBeInTheDocument();
    expect(screen.queryByLabelText("第 1 条发音的实际发音")).toBeNull();
    expect(screen.getByLabelText("新增发音")).toBeVisible();
    fireEvent.click(screen.getByLabelText("新增发音"));
    const next = onChange.mock.calls.at(-1)![0] as DraftFormsStepContentV3;
    const nextForm = next.pos[0]!.forms[0]!;
    if (nextForm.regional_variants.mode !== "common") {
      throw new Error("fixture");
    }
    expect(nextForm.regional_variants.common.pronunciations).toEqual([
      {
        id: uuidFromInt(952),
        dict_phonetic: "",
        actual_pron: "",
        style: "normal"
      }
    ]);
  });

  it("#128 受控向导中连续编辑英美音标不会被 Form.List 回写旧值", () => {
    const form = ukUsFormFixture({
      uk: {
        pronunciations: [
          pronunciationFixture({
            id: uuidFromInt(960),
            dict_phonetic: ""
          })
        ]
      },
      us: {
        pronunciations: [
          pronunciationFixture({
            id: uuidFromInt(961),
            dict_phonetic: ""
          })
        ]
      }
    });
    render(<Harness initial={formsFixture({ forms: [form] })} />);
    const inputs = screen.getAllByLabelText("第 1 条发音的字典音标");

    fireEvent.change(inputs[0]!, { target: { value: "sent-uk" } });
    expect(inputs[0]).toHaveValue("sent-uk");
    expect(inputs[0]).toHaveAttribute("value", "sent-uk");
    fireEvent.change(inputs[1]!, { target: { value: "sent-us" } });
    expect(inputs[0]).toHaveValue("sent-uk");
    expect(inputs[1]).toHaveValue("sent-us");
    expect(inputs[1]).toHaveAttribute("value", "sent-us");

    const updated = canonicalValue().pos[0]!.forms[0]!;
    if (updated.regional_variants.mode !== "uk_us") throw new Error("fixture");
    expect(updated.regional_variants.uk.pronunciations[0]!.dict_phonetic).toBe(
      "sent-uk"
    );
    expect(updated.regional_variants.us.pronunciations[0]!.dict_phonetic).toBe(
      "sent-us"
    );
  });

  it("P1-1 从空 skeleton 经 catalog UI 构建多 POS/组/重复 base 与移动 membership", async () => {
    const ids = Array.from({ length: 20 }, (_, index) =>
      uuidFromInt(1_000 + index)
    );
    render(<Harness initial={{ pos: [] }} idFactory={uuidSequence(...ids)} />);

    await waitFor(() =>
      expect(screen.getByLabelText("添加基本词性")).not.toBeDisabled()
    );
    chooseOption("添加基本词性", "名词");
    expect(canonicalValue().pos[0]).toMatchObject({
      pos_id: ids[0],
      pos: "noun",
      forms: [{ id: ids[2], form_type: "base" }],
      form_groups: [
        {
          id: ids[1],
          members: [{ id: ids[4], form_id: ids[2] }]
        }
      ]
    });

    const firstGroupId = ids[1]!;
    fireEvent.click(screen.getByLabelText("在原形 1 下方添加同类型词形"));
    const firstFormId = ids[2]!;
    const firstMembershipId = ids[4]!;
    const secondFormId = ids[6]!;
    expect(
      canonicalValue().pos[0]!.forms.map((item) => item.form_type)
    ).toEqual(["base", "base"]);

    fireEvent.click(screen.getByRole("button", { name: "新增名词变化组" }));
    const secondGroupId = ids[10]!;
    expect(screen.queryByText("复用已有词形")).toBeNull();

    chooseOption("移动词形 2 到其他变化组", "变化组 2");
    const noun = canonicalValue().pos[0]!;
    expect(noun.forms).toHaveLength(2);
    expect(noun.form_groups[0]!.members.map((item) => item.form_id)).toEqual([
      firstFormId
    ]);
    expect(noun.form_groups[1]!.members.map((item) => item.form_id)).toEqual([
      secondFormId
    ]);
    expect(noun.form_groups[0]!.members[0]!.id).toBe(firstMembershipId);

    const firstGroupCard = document.querySelector<HTMLElement>(
      `[data-group-id="${firstGroupId}"]`
    )!;
    const firstInput = within(firstGroupCard).getByLabelText("原形通用拼写");
    fireEvent.change(firstInput, { target: { value: "orbit" } });
    expect(within(firstGroupCard).getByLabelText("原形通用拼写")).toHaveValue(
      "orbit"
    );

    await chooseGroupAction(2, "上移本组");
    expect(canonicalValue().pos[0]!.form_groups.map((item) => item.id)).toEqual(
      [secondGroupId, firstGroupId]
    );

    chooseOption("添加基本词性", "动词");
    expect(canonicalValue().pos.map((item) => item.pos)).toEqual([
      "noun",
      "verb"
    ]);
    const verb = canonicalValue().pos[1]!;
    expect(verb).toMatchObject({
      pos_id: ids[12],
      pos: "verb",
      forms: [
        {
          id: ids[14],
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: { spelling: "orbit" }
          }
        }
      ],
      form_groups: [
        {
          id: ids[13],
          members: [{ id: ids[16], form_id: ids[14] }]
        }
      ]
    });
  }, 15_000);

  it("#110-111 就地修改词形类型并保留 V3 节点身份与共享关系", async () => {
    const initial = multiPosFixture();
    const original = structuredClone(initial.pos[0]!.forms[0]!);
    const originalGroups = structuredClone(initial.pos[0]!.form_groups);
    render(<Harness initial={initial} />);

    await waitFor(() =>
      expect(
        screen.getAllByLabelText("变化组 1 词形 1 类型")[0]
      ).not.toBeDisabled()
    );
    expect(screen.getByLabelText("变化组 1 词形 2 类型")).not.toBeDisabled();
    chooseOption("变化组 1 词形 1 类型", "复数");
    await waitFor(() =>
      expect(formById(canonicalValue(), original.id).form_type).toBe("plural")
    );

    const updated = formById(canonicalValue(), original.id);
    expect(updated).toEqual({ ...original, form_type: "plural" });
    expect(
      canonicalValue().pos[0]!.forms.map((form) => form.form_type)
    ).toEqual(["plural", "base"]);
    expect(canonicalValue().pos[0]!.form_groups).toEqual(originalGroups);
    expect(screen.getAllByLabelText("变化组 1 词形 1 类型")).toHaveLength(1);
    expect(screen.getByLabelText("变化组 2 词形 1 类型")).toHaveValue("");
  });

  it("#111 历史词形类型不在当前目录时仍产品化回显且不扩散候选", async () => {
    const dynamicCatalog = structuredClone(partOfSpeechCatalogFixture);
    const noun = dynamicCatalog.items.find((item) => item.code === "noun")!;
    noun.allowed_form_types = ["comparative"];
    noun.default_form_types = [];
    catalogState.data = dynamicCatalog;
    const historical = commonFormFixture();
    historical.form_type = "plural";
    render(<Harness initial={formsFixture({ forms: [historical] })} />);

    const select = await screen.findByLabelText("变化组 1 词形 1 类型");
    expect(select).not.toBeDisabled();
    expect(select).toHaveValue("");
    fireEvent.mouseDown(select);
    const choices = [
      ...document.querySelectorAll<HTMLElement>(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
      )
    ].map((item) => item.textContent);
    expect(choices).toEqual(["复数", "原形", "比较级"]);
  });

  it("P1-1 新增 form_type 候选严格消费当前后端 catalog", async () => {
    const dynamicCatalog = structuredClone(partOfSpeechCatalogFixture);
    const noun = dynamicCatalog.items.find((item) => item.code === "noun")!;
    noun.allowed_form_types = ["comparative"];
    noun.default_form_types = [];
    catalogState.data = dynamicCatalog;
    const base = commonFormFixture({
      id: uuidFromInt(1_090),
      variant_id: uuidFromInt(1_091)
    });
    const content = formsFixture({ forms: [base] });
    render(
      <Harness
        initial={content}
        idFactory={uuidSequence(
          uuidFromInt(1_101),
          uuidFromInt(1_102),
          uuidFromInt(1_103),
          uuidFromInt(1_104)
        )}
      />
    );

    fireEvent.click(
      await screen.findByLabelText("在原形 1 下方添加同类型词形")
    );
    chooseOption("变化组 1 词形 2 类型", "比较级");
    expect(
      canonicalValue().pos[0]!.forms.map((form) => form.form_type)
    ).toEqual(["base", "comparative"]);
    expect(screen.queryByText("复数", { exact: true })).toBeNull();
  });

  it.each([
    {
      name: "UD",
      rules: {
        spelling_mode: "unified" as const,
        phonetic_mode: "distinguish" as const
      },
      expectedLabel: "复数英式拼写"
    },
    {
      name: "DD",
      rules: {
        spelling_mode: "distinguish" as const,
        phonetic_mode: "distinguish" as const
      },
      expectedLabel: "复数英式拼写"
    }
  ])(
    "#114 $name 下新增词形立即继承词性方言矩阵",
    async ({ rules, expectedLabel }) => {
      const base = ukUsFormFixture({
        uk: { spelling: "centre" },
        us: {
          spelling: rules.spelling_mode === "unified" ? "centre" : "center"
        }
      });
      const content = formsFixture({ forms: [base], dialect_rules: rules });
      render(
        <Harness
          initial={content}
          idFactory={uuidSequence(
            uuidFromInt(1_201),
            uuidFromInt(1_202),
            uuidFromInt(1_203),
            uuidFromInt(1_204),
            uuidFromInt(1_205),
            uuidFromInt(1_206)
          )}
        />
      );

      fireEvent.click(
        await screen.findByLabelText("在原形 1 下方添加同类型词形")
      );
      chooseOption("变化组 1 词形 2 类型", "复数");

      await waitFor(() =>
        expect(screen.getByLabelText(expectedLabel)).toBeVisible()
      );
      expect(canonicalValue().pos[0]!.forms[1]!.regional_variants.mode).toBe(
        "uk_us"
      );
      const addedForm = canonicalValue().pos[0]!.forms[1]!;
      if (addedForm.regional_variants.mode !== "uk_us") {
        throw new Error("added form must inherit uk_us");
      }
      for (const variant of [
        addedForm.regional_variants.uk,
        addedForm.regional_variants.us
      ]) {
        const addedCell = document.querySelector<HTMLElement>(
          `[data-v3-node-id="${variant.id}"]`
        );
        if (!addedCell) throw new Error("added form dialect cell not found");
        expect(
          within(addedCell).getAllByLabelText("第 1 条发音的字典音标")
        ).toHaveLength(1);
        expect(
          within(addedCell).getAllByLabelText(/在第 1 条后新增发音/)
        ).toHaveLength(1);
        expect(within(addedCell).queryByText("暂无发音")).toBeNull();
      }
      expect(screen.queryByLabelText("复数通用拼写")).toBeNull();
      expect(screen.queryByText("当前词性的英美结构待统一")).toBeNull();
      if (rules.spelling_mode === "distinguish") {
        expect(screen.getByLabelText("复数美式拼写")).toBeVisible();
      }
    }
  );

  it("P1-3 普通删除组遇 orphan form 时先列出影响并等待明确确认", async () => {
    const form = commonFormFixture();
    const keeper = commonFormFixture({ id: uuidFromInt(1_180) });
    const addedFormId = uuidFromInt(1_181);
    const firstGroup = group(uuidFromInt(1_182), [
      { id: uuidFromInt(1_183), form_id: form.id }
    ]);
    const keeperGroup = group(uuidFromInt(1_184), [
      { id: uuidFromInt(1_185), form_id: keeper.id }
    ]);
    const content = formsFixture({
      forms: [form, keeper],
      groups: [firstGroup, keeperGroup]
    });
    const firstRender = render(
      <Harness
        idFactory={uuidSequence(
          addedFormId,
          uuidFromInt(1_186),
          uuidFromInt(1_187),
          uuidFromInt(1_188)
        )}
        initial={content}
      />
    );

    await chooseGroupAction(1, "删除本组");
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

    await chooseGroupAction(1, "删除本组");
    fireEvent.click(
      within(
        firstRender.container.querySelector(
          `[data-group-id="${firstGroup.id}"]`
        ) as HTMLElement
      ).getByLabelText("在原形 1 下方添加同类型词形")
    );
    expect(canonicalValue().pos[0]!.forms).toHaveLength(3);
    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组并同时删除 1 个不再被其他变化组使用的词形"
      })
    );
    expect(screen.getByText("删除影响已变化，请重新确认")).toBeInTheDocument();
    expect(screen.getByText("受影响词形 2")).toBeInTheDocument();
    expect(canonicalValue().pos[0]!.forms).toHaveLength(3);
    expect(canonicalValue().pos[0]!.form_groups).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: "删除变化组并同时删除 2 个不再被其他变化组使用的词形"
      })
    );
    expect(canonicalValue().pos[0]).toMatchObject({
      forms: [keeper],
      form_groups: [keeperGroup]
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
    expect(screen.getByLabelText("添加基本词性")).toBeDisabled();
    unmount();
  }, 15_000);

  it("P1-3 删除仅含 shared form 的组无需破坏性确认且保留 form", async () => {
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

    await chooseGroupAction(1, "删除本组");

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
      expect(screen.getByLabelText("添加基本词性")).not.toBeDisabled()
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除名词"
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: /^删\s*除$/ }));
    await waitFor(() =>
      expect(screen.getByTestId("controlled-active-pos")).toHaveTextContent(
        initial.pos[1]!.pos_id
      )
    );
    expect(activeChanges).toHaveBeenLastCalledWith(initial.pos[1]!.pos_id);
    expect(screen.queryByRole("button", { name: "删除动词" })).toBeNull();
    expect(screen.getByTestId("controlled-pos-count")).toHaveTextContent("1");
    expect(activeChanges).toHaveBeenCalledTimes(1);
  });
});
