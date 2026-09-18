import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PublishedSentenceTargetCandidateV3 } from "@tsz/types";
import { V3TargetCascader, type ResolvedTarget } from "./V3TargetCascader";

const search = vi.fn();
const settings = vi.hoisted(() => ({ preference: "uk" as "uk" | "us" }));
vi.mock("../api", () => ({
  createV3WordRequests: () => ({ searchComponentTargets: search })
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => settings
}));

function candidate(): PublishedSentenceTargetCandidateV3 {
  return {
    entry_id: "job",
    publication_id: "pub",
    headword: "job",
    kind: "word",
    pos: "noun",
    pos_id: "noun",
    base_form_id: "base",
    matched_form_id: "base",
    matched_variant_id: "uk",
    matched_dialect: "uk",
    matched_form_type: "base",
    matches: [],
    component_usages: [],
    // 刻意让非偏好侧先返回，提交坐标不能取决于响应顺序。
    forms: (["us", "uk"] as const).map((dialect) => ({
      form_id: "base",
      variant_id: dialect,
      form_type: "base",
      dialect,
      spelling: "job",
      base_form_ids: ["base"]
    })),
    senses: [
      {
        sense_id: "sense",
        publication_id: "pub",
        pos_id: "noun",
        base_form_id: "base",
        level: "A1",
        gloss: "工作"
      }
    ]
  };
}
function target(dialect: "uk" | "us"): ResolvedTarget {
  return {
    state: "resolved",
    target_word_id: "job",
    target_publication_id: "pub",
    target_pos_id: "noun",
    target_base_form_id: "base",
    target_form_id: "base",
    target_variant_id: dialect,
    target_dialect: dialect,
    target_form_type: "base",
    target_sense_id: "sense",
    target_headword: "job",
    target_gloss: "工作"
  };
}
async function expandJob() {
  fireEvent.click(
    await screen.findByText("job", {
      selector: ".v3-component-usage-entry strong"
    })
  );
}
beforeEach(() => {
  settings.preference = "uk";
  search.mockReset();
  search.mockResolvedValue({ matches: [candidate()], truncated: false });
});

it("通用正文的同词形同拼写只展示一行，新关联提交偏好侧真实坐标", async () => {
  const onReplace = vi.fn();
  render(
    <V3TargetCascader
      literal="job"
      targets={[]}
      onReplace={onReplace}
      targetKind="word"
      phraseSelection="entry"
      sourceDialect="common"
    />
  );
  await expandJob();
  expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
  expect(screen.queryByText(/美式/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("原形 job"));
  fireEvent.click(await screen.findByText("工作"));
  expect(onReplace).toHaveBeenCalledExactlyOnceWith([target("uk")], undefined);
});

it.each(["uk", "us"] as const)(
  "旧%s关联在合并行中回显，重新选择不换侧且仍可清除",
  async (dialect) => {
    const onReplace = vi.fn();
    const existing = target(dialect);
    render(
      <V3TargetCascader
        literal="job"
        targets={[existing]}
        onReplace={onReplace}
      />
    );
    await expandJob();
    expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
    fireEvent.click(screen.getByText("原形 job"));
    const sense = await screen.findByText("工作");
    expect(sense.querySelector(".v3-component-usage-radio")).toHaveClass(
      "is-checked"
    );
    fireEvent.click(sense);
    expect(onReplace).toHaveBeenLastCalledWith([existing], undefined);
    fireEvent.click(screen.getByText("清除关联"));
    expect(onReplace).toHaveBeenLastCalledWith([]);
  }
);

it.each(["uk", "us"] as const)(
  "正文%s优先于管理员相反偏好，仍提交正文侧",
  async (dialect) => {
    settings.preference = dialect === "uk" ? "us" : "uk";
    const onReplace = vi.fn();
    render(
      <V3TargetCascader
        literal="job"
        targets={[]}
        onReplace={onReplace}
        targetKind="word"
        phraseSelection="entry"
        sourceDialect={dialect}
      />
    );
    await expandJob();
    expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
    fireEvent.click(screen.getByText("原形 job"));
    fireEvent.click(await screen.findByText("工作"));
    expect(onReplace).toHaveBeenCalledExactlyOnceWith(
      [target(dialect)],
      undefined
    );
  }
);

it("新关联随管理员偏好切换选择真实坐标，合并行保持唯一", async () => {
  const onReplace = vi.fn();
  const panel = (
    <V3TargetCascader
      literal="job"
      targets={[]}
      onReplace={onReplace}
      phraseSelection="entry"
      sourceDialect="common"
    />
  );
  const { rerender } = render(panel);
  await expandJob();
  settings.preference = "us";
  rerender(
    <V3TargetCascader
      literal="job"
      targets={[]}
      onReplace={onReplace}
      phraseSelection="entry"
      sourceDialect="common"
    />
  );
  expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
  fireEvent.click(screen.getByText("原形 job"));
  fireEvent.click(await screen.findByText("工作"));
  expect(onReplace).toHaveBeenCalledExactlyOnceWith([target("us")], undefined);
});

it("只读旧关联通过合并路径自动展开和回显，不允许更换", async () => {
  const onReplace = vi.fn();
  render(
    <V3TargetCascader
      literal="job"
      targets={[]}
      selectedTarget={target("us")}
      onReplace={onReplace}
      readOnly
      phraseSelection="entry"
      sourceDialect="common"
    />
  );
  const sense = await screen.findByText("工作");
  expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
  expect(sense.querySelector(".v3-component-usage-radio")).toHaveClass(
    "is-checked"
  );
  expect(sense.closest("li")).toHaveClass("ant-cascader-menu-item-disabled");
  fireEvent.click(sense);
  expect(onReplace).not.toHaveBeenCalled();
});

it("清除后保留旧侧供回选，切换偏好也不改变已有目标", async () => {
  const onReplace = vi.fn();
  const old = target("us");
  const { rerender } = render(
    <V3TargetCascader literal="job" targets={[old]} onReplace={onReplace} />
  );
  await screen.findByText("工作");
  fireEvent.click(screen.getByText("清除关联"));
  rerender(
    <V3TargetCascader literal="job" targets={[]} onReplace={onReplace} />
  );
  await expandJob();
  fireEvent.click(screen.getByText("原形 job"));
  const unselected = await screen.findByText("工作");
  expect(unselected.querySelector(".v3-component-usage-radio")).not.toHaveClass(
    "is-checked"
  );
  fireEvent.click(unselected);
  expect(onReplace).toHaveBeenLastCalledWith([old], undefined);
  settings.preference = "us";
  rerender(
    <V3TargetCascader literal="job" targets={[old]} onReplace={onReplace} />
  );
  expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
  expect(
    (await screen.findByText("工作")).querySelector(".v3-component-usage-radio")
  ).toHaveClass("is-checked");
});

it("不同拼写、大小写、词形和词性不能按显示文字误合并", async () => {
  const noun = candidate();
  noun.forms.push(
    { ...noun.forms[1]!, variant_id: "capital", spelling: "Job" },
    {
      ...noun.forms[1]!,
      variant_id: "other-group",
      form_id: "other-base",
      base_form_ids: ["other-base"]
    },
    { ...noun.forms[1]!, variant_id: "different-spelling", spelling: "jobs" }
  );
  const verb = candidate();
  verb.pos = "verb";
  verb.pos_id = "verb";
  verb.senses = [
    {
      ...verb.senses[0]!,
      pos_id: "verb",
      sense_id: "verb-sense",
      gloss: "做零工"
    }
  ];
  search.mockResolvedValue({ matches: [noun, verb], truncated: false });
  render(
    <V3TargetCascader
      literal="job"
      targets={[target("us")]}
      onReplace={vi.fn()}
    />
  );
  await expandJob();
  expect(screen.getAllByText(/^原形 job（名词）$/)).toHaveLength(2);
  expect(screen.getByText("原形 Job（名词）")).toBeInTheDocument();
  expect(screen.getByText("原形 jobs（名词）")).toBeInTheDocument();
  fireEvent.click(screen.getByText("原形 job（动词）"));
  expect(await screen.findByText("做零工")).toBeInTheDocument();
  expect(screen.queryByText("工作")).not.toBeInTheDocument();
});

it("合并展示仍按每侧可关联词义构造合法坐标，不泄漏专用词义", async () => {
  const item = candidate();
  item.forms[0]!.allowed_sense_ids = ["us-only"];
  item.forms[1]!.allowed_sense_ids = ["sense"];
  item.senses.push(
    { ...item.senses[0]!, sense_id: "us-only", gloss: "美式专用" },
    { ...item.senses[0]!, sense_id: "excluded", gloss: "不适用的词义" }
  );
  search.mockResolvedValue({ matches: [item], truncated: false });
  const onReplace = vi.fn();
  render(
    <V3TargetCascader
      literal="job"
      targets={[]}
      onReplace={onReplace}
      phraseSelection="entry"
      sourceDialect="common"
    />
  );
  await expandJob();
  expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
  fireEvent.click(screen.getByText("原形 job"));
  fireEvent.click(await screen.findByText("美式专用"));
  expect(onReplace).toHaveBeenLastCalledWith(
    [{ ...target("us"), target_sense_id: "us-only", target_gloss: "美式专用" }],
    undefined
  );
  fireEvent.click(screen.getByText("工作"));
  expect(onReplace).toHaveBeenLastCalledWith([target("uk")], undefined);
  expect(screen.queryByText("不适用的词义")).not.toBeInTheDocument();
});

it("分页追加同词形另一侧不增加显示行或丢失选中态", async () => {
  const us = candidate();
  us.forms = [us.forms[0]!];
  const uk = candidate();
  uk.forms = [uk.forms[1]!];
  search
    .mockResolvedValueOnce({
      matches: [us],
      truncated: true,
      next_cursor: "page-2"
    })
    .mockResolvedValueOnce({ matches: [uk], truncated: false });
  const onReplace = vi.fn();
  render(
    <V3TargetCascader
      literal="job"
      targets={[target("us")]}
      onReplace={onReplace}
      phraseSelection="entry"
      sourceDialect="common"
    />
  );
  expect(
    (await screen.findByText("工作")).querySelector(".v3-component-usage-radio")
  ).toHaveClass("is-checked");
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await screen.findByText("原形 job");
  expect(screen.getAllByText(/原形 job/)).toHaveLength(1);
  const sense = screen.getByText("工作");
  expect(sense.querySelector(".v3-component-usage-radio")).toHaveClass(
    "is-checked"
  );
  fireEvent.click(sense);
  expect(onReplace).toHaveBeenLastCalledWith([target("us")], undefined);
});
