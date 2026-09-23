import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  AdminWordV3,
  PublishedSentenceTargetCandidateV3
} from "@tsz/types";
import { V3TargetCascader } from "./V3TargetCascader";

const search = vi.fn();
vi.mock("../api", () => ({
  createV3WordRequests: () => ({ searchComponentTargets: search })
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));
beforeEach(() => {
  search.mockReset();
});

async function clickOption(element: HTMLElement) {
  // fireEvent 的同步 act 不等待后续更新；异步边界让级联展开完成后再断言。
  await act(async () => {
    fireEvent.click(element);
  });
}

function candidate(
  entryId: string,
  headword: string,
  senses: { id: string; gloss: string }[]
): PublishedSentenceTargetCandidateV3 {
  return {
    entry_id: entryId,
    publication_id: `pub-${entryId}`,
    headword,
    kind: "word",
    pos: "noun",
    pos_id: "noun",
    base_form_id: "base",
    matched_form_id: "base",
    matched_variant_id: "common",
    matched_dialect: "common",
    matched_form_type: "base",
    matches: [],
    component_usages: [],
    forms: [
      {
        form_id: "base",
        variant_id: "common",
        form_type: "base",
        dialect: "common",
        spelling: headword,
        base_form_ids: ["base"]
      }
    ],
    senses: senses.map((sense) => ({
      sense_id: sense.id,
      publication_id: `pub-${entryId}`,
      pos_id: "noun",
      base_form_id: "base",
      level: "A1",
      gloss: sense.gloss
    }))
  };
}

/** 第 N 列（词条 → 词形 → 词义）的可见文本，按渲染顺序。 */
function columnTexts(column: number): string[] {
  const menu = document.querySelectorAll(".ant-cascader-menu")[column];
  return Array.from(menu?.querySelectorAll("li") ?? []).map((item) =>
    (item.textContent ?? "").trim()
  );
}

const candidates = [
  candidate("bank", "bank", [{ id: "bank-sense", gloss: "银行" }]),
  candidate("work", "work", [
    { id: "work-sense-1", gloss: "工作" },
    { id: "work-sense-2", gloss: "职业" }
  ])
];

it("把例句所处词条、词形和词义一起前移到候选首位", async () => {
  search.mockResolvedValue({ matches: candidates, truncated: false });
  // 等候异步候选加载及 Cascader 的初始展开 effect，避免初始化清空首次点击。
  await act(async () => {
    render(
      <V3TargetCascader
        literal="work"
        targets={[]}
        onReplace={vi.fn()}
        prioritizedEntryId="work"
        prioritizedSenseId="work-sense-2"
      />
    );
  });
  await screen.findByText("bank");
  expect(columnTexts(0)[0]).toContain("work");
  expect(columnTexts(0)[1]).toContain("bank");
  await clickOption(screen.getByText("work"));
  await waitFor(() => expect(columnTexts(1)[0]).toContain("原形 work"));
  await clickOption(screen.getByText("原形 work"));
  await waitFor(() => {
    expect(columnTexts(2)[0]).toContain("职业");
    expect(columnTexts(2)[1]).toContain("工作");
  });
});

it("目标词条不在候选里时保持后端候选顺序", async () => {
  search.mockResolvedValue({ matches: candidates, truncated: false });
  render(
    <V3TargetCascader
      literal="work"
      targets={[]}
      onReplace={vi.fn()}
      prioritizedEntryId="missing"
      prioritizedSenseId="missing-sense"
    />
  );
  await screen.findByText("bank");
  expect(columnTexts(0)[0]).toContain("bank");
});

it("未传置顶目标时保持后端候选顺序", async () => {
  search.mockResolvedValue({ matches: candidates, truncated: false });
  render(<V3TargetCascader literal="work" targets={[]} onReplace={vi.fn()} />);
  await screen.findByText("bank");
  expect(columnTexts(0)[0]).toContain("bank");
});

const step2: AdminWordV3["forms"] = {
  pos: ["adverb", "pronoun", "noun"].map((pos) => ({
    pos_id: pos,
    pos,
    forms: [1, 2].map((n) => ({
      id: `${pos}-${n}`,
      form_type: "base",
      regional_variants: {
        mode: "common",
        common: {
          id: `${pos}-${n}-variant`,
          dialect: "common",
          spelling: `some-${pos}-${n}`,
          origin: "manual",
          pronunciations: []
        }
      }
    })),
    form_groups: [
      {
        id: `${pos}-group`,
        is_regular: true,
        scope: "general",
        dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
        // 组成员顺序与 forms 存储顺序相反，验证真正跟随 Step 2 展示顺序。
        members: [2, 1].map((n) => ({
          id: `${pos}-member-${n}`,
          form_id: `${pos}-${n}`
        }))
      }
    ]
  }))
};

function multiPosCandidates(): PublishedSentenceTargetCandidateV3[] {
  // 搜索顺序故意与 Step 2 不同。
  return ["noun", "adverb", "pronoun"].map((pos) => {
    const value = candidate("some", "some", [
      { id: `${pos}-other`, gloss: `${pos}其他词义` },
      { id: `${pos}-current`, gloss: `${pos}当前词义` }
    ]);
    return {
      ...value,
      pos,
      pos_id: pos,
      senses: value.senses.map((sense) => ({ ...sense, pos_id: pos })),
      forms: [1, 2].map((n) => ({
        ...value.forms[0]!,
        form_id: `${pos}-${n}`,
        variant_id: `${pos}-${n}-variant`,
        spelling: `some-${pos}-${n}`,
        // 当前词义只属于第 1 个词形，第 2 个仍须跟随整个词性一起置顶。
        allowed_sense_ids:
          n === 1 ? [`${pos}-other`, `${pos}-current`] : [`${pos}-other`]
      }))
    };
  });
}

it.each(["pronoun", "noun"])(
  "当前 %s 的全部词形优先，其余按 Step 2 顺序",
  async (pos) => {
    const input = multiPosCandidates();
    const original = structuredClone(input);
    search.mockResolvedValue({ matches: input, truncated: false });
    render(
      <V3TargetCascader
        literal="some"
        targets={[]}
        onReplace={vi.fn()}
        prioritizedEntryId="some"
        prioritizedSenseId={`${pos}-current`}
        prioritizedPosId={pos}
        prioritizedForms={step2}
      />
    );
    await clickOption(await screen.findByText("some"));
    const orderedPos = [
      pos,
      ...step2.pos.map((item) => item.pos).filter((item) => item !== pos)
    ];
    // 级联展开后的列渲染可能晚于点击；每次重读 DOM，仍完整核对数量与顺序。
    await waitFor(() => {
      const labels = columnTexts(1);
      expect(labels).toHaveLength(6);
      orderedPos
        .flatMap((item) => [2, 1].map((n) => `some-${item}-${n}`))
        .forEach((label, index) => expect(labels[index]).toContain(label));
    });
    await clickOption(screen.getByText(new RegExp(`原形 some-${pos}-1`)));
    await waitFor(() =>
      expect(columnTexts(2)).toEqual([`${pos}当前词义`, `${pos}其他词义`])
    );
    expect(input).toEqual(original);
  }
);

it("当前词义未进入候选时仍能按当前词性置顶", async () => {
  search.mockResolvedValue({ matches: multiPosCandidates(), truncated: false });
  render(
    <V3TargetCascader
      literal="some"
      targets={[]}
      onReplace={vi.fn()}
      prioritizedEntryId="some"
      prioritizedSenseId="unpublished-sense"
      prioritizedPosId="pronoun"
      prioritizedForms={step2}
    />
  );
  await clickOption(await screen.findByText("some"));
  await waitFor(() => {
    expect(columnTexts(1)[0]).toContain("some-pronoun-2");
    expect(columnTexts(1)[1]).toContain("some-pronoun-1");
  });
});
