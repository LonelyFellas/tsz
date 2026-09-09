import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { V3TextAssociationPicker } from "./V3TextAssociationPicker";
const search = vi.fn();
vi.mock("../api", () => ({
  createV3WordRequests: () => ({
    searchComponentTargets: (input: unknown) => search(input)
  })
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));
function giveEntryResponse() {
  return {
    total: 1,
    truncated: false,
    matches: [
      {
        entry_id: "entry-give",
        publication_id: "pub-give",
        pos_id: "pos-give",
        base_form_id: "form-give",
        headword: "give",
        kind: "word" as const,
        pos: "verb",
        matched_form_id: "form-give",
        matched_variant_id: "variant-give",
        matched_dialect: "common" as const,
        matched_form_type: "base" as const,
        component_usages: [],
        forms: [
          {
            form_id: "form-give",
            variant_id: "variant-give",
            form_type: "base" as const,
            spelling: "give",
            dialect: "common" as const,
            base_form_ids: ["form-give"]
          }
        ],
        matches: [],
        senses: [
          {
            sense_id: "sense-give-1",
            publication_id: "pub-give",
            pos_id: "pos-give",
            base_form_id: "form-give",
            level: "A1",
            gloss: "给；交给"
          }
        ]
      }
    ]
  };
}

const segments = [
  { start: 0, end: 4, surface: "give" },
  { start: 8, end: 10, surface: "up" }
];
async function selectGive() {
  await waitFor(() => {
    fireEvent.click(document.querySelector(".ant-cascader-menu-item-content")!);
    expect(screen.getByText(/原形 give/)).toBeVisible();
  });
  fireEvent.click(
    screen.getByText(/原形 give/).closest(".ant-cascader-menu-item-content")!
  );
  fireEvent.click(
    (await screen.findByText("给；交给")).closest(
      ".ant-cascader-menu-item-content"
    )!
  );
}
it("关联单词只查询并展示单词，保留稳定目标身份", async () => {
  search.mockResolvedValue({
    ...giveEntryResponse(),
    matches: [...giveEntryResponse().matches, ...phraseResponse().matches]
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="word"
      segments={[segments[0]!]}
      onSelect={onSelect}
    />
  );
  await selectGive();
  expect(search).toHaveBeenCalledWith(
    expect.objectContaining({
      q: "give",
      kind: "word",
      match: "exact",
      include_drafts: true
    })
  );
  expect(
    screen.queryByText("give up", { exact: true })
  ).not.toBeInTheDocument();
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      source_segments: [segments[0]],
      target_word_id: "entry-give",
      target_sense_id: "sense-give-1"
    })
  );
  expect(onSelect.mock.lastCall![0].via_phrase).toBeUndefined();
});
function phraseResponse() {
  const word = giveEntryResponse().matches[0]!;
  const component = {
    state: "resolved" as const,
    id: "component",
    literal: "give",
    target_word_id: "entry-give",
    target_publication_id: "pub-give",
    target_pos_id: "pos-give",
    target_base_form_id: "form-give",
    target_form_id: "form-give",
    target_variant_id: "variant-give",
    target_sense_id: "sense-give-1",
    target_dialect: "common" as const,
    target_form_type: "base" as const,
    target_headword: "give",
    target_gloss: "给；交给"
  };
  const phrase = {
    ...word,
    entry_id: "phrase",
    publication_id: "phrase-pub",
    kind: "phrase" as const,
    headword: "give up",
    forms: word.forms.map((form) => ({ ...form, spelling: "give up" })),
    senses: [
      {
        ...word.senses[0]!,
        sense_id: "phrase-sense",
        publication_id: "phrase-pub",
        gloss: "放弃",
        component_usages: [component]
      }
    ]
  };
  // 同一短语的英美命中携带相同释义级成分，不应重复渲染入口。
  return {
    total: 2,
    truncated: false,
    matches: [
      { ...phrase, matched_dialect: "uk" as const },
      { ...phrase, matched_dialect: "us" as const }
    ]
  };
}

function column(index: number) {
  return within(
    document.querySelectorAll<HTMLElement>(".ant-cascader-menu")[index]!
  );
}

async function openPhraseComponent() {
  await waitFor(() => {
    fireEvent.click(column(0).getByText("give up", { exact: true }));
    expect(column(1).getByText("give", { exact: true })).toBeVisible();
  });
  expect(column(0).getAllByText("give up", { exact: true })).toHaveLength(1);
  expect(column(1).getAllByText("give", { exact: true })).toHaveLength(1);
  fireEvent.click(column(1).getByText("give", { exact: true }));
}

function mockPhraseSearch() {
  search.mockImplementation(async ({ q }) =>
    q === "give" ? giveEntryResponse() : phraseResponse()
  );
}

it("短语四级选择后只能查看和清除，不能重复关联", async () => {
  mockPhraseSearch();
  const onSelect = vi.fn();
  const { rerender } = render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await screen.findByText("give up", { exact: true });
  expect(screen.queryByText(/· 成分用词/)).not.toBeInTheDocument();
  await openPhraseComponent();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByText("原形 give", { exact: true }));
  expect(document.querySelectorAll(".ant-cascader-menu")).toHaveLength(4);
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(column(3).getByText("给；交给"));
  expect(onSelect.mock.lastCall![0]).toMatchObject({
    source_segments: segments,
    target_word_id: "entry-give",
    via_phrase: {
      word_id: "phrase",
      publication_id: "phrase-pub",
      sense_id: "phrase-sense",
      component_id: "component"
    }
  });
  search.mockClear();
  rerender(
    <V3TextAssociationPicker
      kind="phrase"
      key="reopen"
      segments={segments}
      selected={onSelect.mock.lastCall![0]}
      onSelect={onSelect}
    />
  );
  expect(screen.getByText(/已关联：give/)).toBeVisible();
  expect(
    screen.getByText("这些单词已有关联，请先清除原关联再重新选择。")
  ).toBeVisible();
  expect(document.querySelectorAll(".ant-cascader-menu")).toHaveLength(0);
  expect(search).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("清除关联"));
  expect(onSelect).toHaveBeenLastCalledWith(undefined);
});

it("关联短语只展示短语及其成分，不再提供短语本身入口", async () => {
  search.mockImplementation(async ({ q }) =>
    q === "give"
      ? giveEntryResponse()
      : {
          ...phraseResponse(),
          matches: [...giveEntryResponse().matches, ...phraseResponse().matches]
        }
  );
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={vi.fn()}
    />
  );
  await openPhraseComponent();
  expect(search).toHaveBeenCalledWith(
    expect.objectContaining({
      q: "give up",
      kind: "phrase",
      match: "exact",
      include_drafts: true
    })
  );
  expect(
    column(0).queryByText("give", { exact: true })
  ).not.toBeInTheDocument();
  expect(screen.queryByText("短语本身")).not.toBeInTheDocument();
});

it("没有释义级成分的短语不能当作可提交叶子", async () => {
  const response = phraseResponse();
  response.matches.forEach((candidate) =>
    candidate.senses.forEach((sense) => {
      sense.component_usages = [];
    })
  );
  search.mockResolvedValue(response);
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  const phrase = await screen.findByText(/give up（未配置成分用词）/);
  expect(phrase.closest(".ant-cascader-menu-item")).toHaveClass(
    "ant-cascader-menu-item-disabled"
  );
  fireEvent.click(phrase);
  expect(onSelect).not.toHaveBeenCalled();
});

it("成分查询失败不提交关联，可原位重试后继续选择", async () => {
  search.mockImplementation(async ({ q }) => {
    if (q === "give") throw new Error("offline");
    return phraseResponse();
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await openPhraseComponent();
  await screen.findByRole("button", { name: /重\s*试/ });
  expect(onSelect).not.toHaveBeenCalled();
  mockPhraseSearch();
  fireEvent.click(await screen.findByRole("button", { name: /重\s*试/ }));
  fireEvent.click(await screen.findByText("原形 give", { exact: true }));
  fireEvent.click(column(3).getByText("给；交给"));
  expect(onSelect.mock.lastCall![0].via_phrase.component_id).toBe("component");
});

it("不同短语词义的同名成分分别展示，选择保留对应来源", async () => {
  const response = phraseResponse();
  for (const candidate of response.matches) {
    const first = candidate.senses[0]!;
    candidate.senses.push({
      ...first,
      sense_id: "second-sense",
      gloss: "交出",
      component_usages: [
        { ...first.component_usages[0]!, id: "second-component" }
      ]
    });
  }
  search.mockImplementation(async ({ q }) =>
    q === "give" ? giveEntryResponse() : response
  );
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await waitFor(() => {
    fireEvent.click(column(0).getByText("give up", { exact: true }));
    expect(column(1).getByText("give（交出）")).toBeVisible();
  });
  expect(column(1).getAllByText("give（放弃）")).toHaveLength(1);
  fireEvent.click(column(1).getByText("give（交出）"));
  fireEvent.click(await screen.findByText("原形 give", { exact: true }));
  fireEvent.click(column(3).getByText("给；交给"));
  expect(onSelect.mock.lastCall![0].via_phrase).toMatchObject({
    sense_id: "second-sense",
    component_id: "second-component"
  });
});

function draftify<T extends { publication_id?: string }>(
  value: T
): Omit<T, "publication_id"> {
  const { publication_id: omitted, ...rest } = value;
  void omitted;
  return rest;
}

it("草稿候选带「草稿」标记，选中后的关联不带发布版本", async () => {
  const response = giveEntryResponse();
  const candidate = draftify(response.matches[0]!);
  search.mockResolvedValue({
    ...response,
    matches: [{ ...candidate, senses: candidate.senses.map(draftify) }]
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="word"
      segments={[segments[0]!]}
      onSelect={onSelect}
    />
  );
  expect(await screen.findByText("草稿")).toBeVisible();
  await selectGive();
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      target_word_id: "entry-give",
      target_sense_id: "sense-give-1"
    })
  );
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
    "target_publication_id"
  );
});

it("已关联到草稿目标时在已关联视图里标出草稿", () => {
  render(
    <V3TextAssociationPicker
      kind="word"
      segments={[segments[0]!]}
      onSelect={vi.fn()}
      selected={{
        id: "link-1",
        source_segments: [segments[0]!],
        target_word_id: "entry-give",
        target_pos_id: "pos-give",
        target_base_form_id: "form-give",
        target_form_id: "form-give",
        target_variant_id: "variant-give",
        target_sense_id: "sense-give-1",
        target_headword: "give",
        target_gloss: "给；交给"
      }}
    />
  );
  expect(screen.getByText(/已关联：give · 给；交给（草稿）/)).toBeVisible();
});

it("还没保存词义的草稿列成禁用行并说明原因", async () => {
  const response = giveEntryResponse();
  const candidate = draftify(response.matches[0]!);
  search.mockResolvedValue({
    ...response,
    matches: [{ ...candidate, senses: [] }]
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="word"
      segments={[segments[0]!]}
      onSelect={onSelect}
    />
  );
  const row = await screen.findByText("give（暂无词义）");
  expect(row).toBeVisible();
  expect(screen.getByText("草稿")).toBeVisible();
  expect(row.closest(".ant-cascader-menu-item")?.className).toContain(
    "ant-cascader-menu-item-disabled"
  );
  expect(screen.queryByText("没有匹配的词条")).not.toBeInTheDocument();
  fireEvent.click(row);
  expect(onSelect).not.toHaveBeenCalled();
});
