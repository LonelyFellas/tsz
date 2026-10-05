import { useState } from "react";
import { ConfigProvider } from "antd";
import type {
  GrammarFormLinkV3,
  PublishedSentenceTargetCandidateV3,
  DraftMeaningsStepContentWritableV3
} from "@tsz/types";
import { commonFormFixture, formsFixture, ukUsFormFixture } from "../fixtures";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { V3TextAssociationPicker } from "./V3TextAssociationPicker";
import { V3GrammarFormPicker } from "./V3GrammarFormPicker";
const search = vi.fn();
const get = vi.fn();
vi.mock("../api", () => ({
  createV3WordRequests: () => ({
    get: (id: string) => get(id),
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
it("语法结构选到词形即绑定，无释义的词形也可选择，且不发送释义字段", async () => {
  const response = giveEntryResponse();
  response.matches[0]!.senses = [];
  search.mockResolvedValue(response);
  const onSelect = vi.fn();
  render(
    <V3GrammarFormPicker
      kind="word"
      segments={[segments[0]!]}
      onSelect={onSelect}
    />
  );
  await waitFor(() => {
    fireEvent.click(document.querySelector(".ant-cascader-menu-item-content")!);
    expect(screen.getByText(/原形 give/)).toBeVisible();
  });
  fireEvent.click(
    screen.getByText(/原形 give/).closest(".ant-cascader-menu-item-content")!
  );
  expect(onSelect).toHaveBeenCalledWith({
    id: expect.any(String),
    source_segments: [segments[0]],
    target_word_id: "entry-give",
    target_publication_id: "pub-give",
    target_pos_id: "pos-give",
    target_form_id: "form-give",
    target_variant_id: "variant-give",
    target_dialect: "common"
  });
  expect(screen.queryByText("暂无可关联词义")).toBeNull();
});

it("语法结构可关联当前未保存词形，服务端没有候选也可选择", async () => {
  search.mockResolvedValue({ total: 0, truncated: false, matches: [] });
  const onSelect = vi.fn();
  render(
    <V3GrammarFormPicker
      kind="word"
      wordId="entry-job"
      forms={formsFixture({
        pos_id: "pos-job",
        forms: [
          commonFormFixture({
            id: "form-job",
            variant_id: "variant-job",
            spelling: "job"
          })
        ]
      })}
      segments={[{ start: 2, end: 5, surface: "job" }]}
      onSelect={onSelect}
    />
  );
  await waitFor(() => {
    fireEvent.click(screen.getByText(/job.*当前词条/));
    expect(screen.getByText("原形 job · 英美通用")).toBeVisible();
  });
  fireEvent.click(screen.getByText("原形 job · 英美通用"));
  expect(onSelect).toHaveBeenCalledWith({
    id: expect.any(String),
    source_segments: [{ start: 2, end: 5, surface: "job" }],
    target_word_id: "entry-job",
    target_pos_id: "pos-job",
    target_form_id: "form-job",
    target_variant_id: "variant-job",
    target_dialect: "common"
  });
  expect(screen.queryByText("没有匹配的词形")).toBeNull();
});

it("语法结构搜索包含其他词条的已保存草稿", async () => {
  const candidate = draftify(giveEntryResponse().matches[0]!);
  search.mockImplementation((input) =>
    Promise.resolve({
      total: input.include_drafts ? 1 : 0,
      truncated: false,
      matches: input.include_drafts ? [candidate] : []
    })
  );
  const onSelect = vi.fn();
  render(
    <V3GrammarFormPicker
      kind="word"
      segments={[segments[0]!]}
      onSelect={onSelect}
    />
  );
  await waitFor(() => {
    fireEvent.click(screen.getByText("give · 动词（草稿）"));
    expect(screen.getByText("原形 give · 英美通用")).toBeVisible();
  });
  fireEvent.click(screen.getByText("原形 give · 英美通用"));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ target_word_id: "entry-give" })
  );
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
    "target_publication_id"
  );
});

it("当前词条只展示编辑中的词形，不重复展示已保存草稿或旧发布版本", async () => {
  const published = giveEntryResponse().matches[0]!;
  search.mockResolvedValue({
    total: 3,
    truncated: false,
    matches: [
      published,
      draftify(published),
      { ...published, entry_id: "entry-other", headword: "other give" }
    ]
  });
  const forms = formsFixture({
    pos_id: "pos-give",
    pos: "verb",
    forms: [
      commonFormFixture({
        id: "form-new",
        variant_id: "variant-new",
        spelling: "give"
      })
    ]
  });
  const props = {
    kind: "word" as const,
    wordId: "entry-give",
    forms,
    segments: [segments[0]!],
    onSelect: vi.fn()
  };
  const { rerender } = render(<V3GrammarFormPicker {...props} />);
  await screen.findByText("other give · 动词");
  expect(screen.queryByText("give · 动词")).toBeNull();
  expect(screen.queryByText("give · 动词（草稿）")).toBeNull();
  await waitFor(() => {
    fireEvent.click(screen.getByText(/give.*当前词条/));
    expect(screen.getByText("原形 give · 英美通用")).toBeVisible();
  });
  fireEvent.click(screen.getByText("原形 give · 英美通用"));
  expect(props.onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      target_word_id: "entry-give",
      target_form_id: "form-new",
      target_variant_id: "variant-new"
    })
  );
  expect(props.onSelect.mock.lastCall![0]).not.toHaveProperty(
    "target_publication_id"
  );
  rerender(<V3GrammarFormPicker {...props} forms={{ pos: [] }} />);
  expect(screen.queryByText(/当前词条/)).toBeNull();
  expect(screen.getByText("other give · 动词")).toBeVisible();
});

it.each(["uk", "us"] as const)(
  "当前未保存词形按归一化词面匹配，保留 %s 变体身份",
  async (dialect) => {
    search.mockResolvedValue({ total: 0, truncated: false, matches: [] });
    const onSelect = vi.fn();
    render(
      <V3GrammarFormPicker
        kind="word"
        wordId="entry-job"
        forms={formsFixture({
          pos_id: "pos-job",
          forms: [
            commonFormFixture({ spelling: "job" }),
            ukUsFormFixture({
              id: "form-jobs",
              form_type: "plural",
              uk: { id: "variant-uk", spelling: "jobs" },
              us: { id: "variant-us", spelling: "jobs" }
            })
          ]
        })}
        segments={[{ start: 0, end: 4, surface: "ＪＯＢＳ" }]}
        onSelect={onSelect}
      />
    );
    await waitFor(() => {
      fireEvent.click(screen.getByText(/当前词条/));
      expect(screen.getByText("复数 jobs · 英式")).toBeVisible();
    });
    expect(screen.queryByText("原形 job · 英美通用")).toBeNull();
    fireEvent.click(
      screen.getByText(`复数 jobs · ${dialect === "uk" ? "英式" : "美式"}`)
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        target_word_id: "entry-job",
        target_pos_id: "pos-job",
        target_form_id: "form-jobs",
        target_variant_id: `variant-${dialect}`,
        target_dialect: dialect
      })
    );
  }
);

it("已关联当前词条从编辑中词形回显，不再读取服务端旧草稿", async () => {
  search.mockResolvedValue({ total: 0, truncated: false, matches: [] });
  get.mockClear();
  get.mockRejectedValue(new Error("当前未保存词形不在服务端草稿中"));
  const selected: GrammarFormLinkV3 = {
    id: "link-job",
    source_segments: [{ start: 2, end: 5, surface: "job" }],
    target_word_id: "entry-job",
    target_pos_id: "pos-job",
    target_form_id: "form-job",
    target_variant_id: "variant-job",
    target_dialect: "common"
  };
  render(
    <V3GrammarFormPicker
      kind="word"
      wordId="entry-job"
      forms={formsFixture({
        pos_id: "pos-job",
        forms: [
          commonFormFixture({
            id: "form-job",
            variant_id: "variant-job",
            spelling: "job"
          })
        ]
      })}
      segments={selected.source_segments}
      selected={selected}
      onSelect={vi.fn()}
    />
  );
  const form = await screen.findByText("原形 job · 英美通用");
  expect(form.closest(".ant-cascader-menu-item")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  expect(screen.getAllByText("原形 job · 英美通用")).toHaveLength(1);
  expect(get).not.toHaveBeenCalled();
});

it("已有发布版自关联仍回显，确认后可切换为当前编辑词形", async () => {
  search.mockResolvedValue(giveEntryResponse());
  const onSelect = vi.fn();
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <V3GrammarFormPicker
        kind="word"
        wordId="entry-give"
        forms={formsFixture({
          pos_id: "pos-give",
          pos: "verb",
          forms: [
            commonFormFixture({
              id: "form-new",
              variant_id: "variant-new",
              spelling: "give"
            })
          ]
        })}
        segments={[segments[0]!]}
        selected={{
          id: "link-old",
          source_segments: [segments[0]!],
          target_word_id: "entry-give",
          target_publication_id: "pub-give",
          target_pos_id: "pos-give",
          target_form_id: "form-give",
          target_variant_id: "variant-give",
          target_dialect: "common"
        }}
        onSelect={onSelect}
      />
    </ConfigProvider>
  );
  const selectedForm = await screen.findByText("原形 give · 英美通用");
  expect(selectedForm.closest(".ant-cascader-menu-item")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  fireEvent.click(selectedForm);
  expect(onSelect).not.toHaveBeenCalled();
  await waitFor(() => {
    fireEvent.click(screen.getByText("give · 动词（当前词条）"));
    expect(
      screen
        .getByText("原形 give · 英美通用")
        .closest(".ant-cascader-menu-item")
    ).toHaveAttribute("aria-checked", "false");
  });
  fireEvent.click(screen.getByText("原形 give · 英美通用"));
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: /^切\s*换$/ }));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      target_word_id: "entry-give",
      target_form_id: "form-new",
      target_variant_id: "variant-new"
    })
  );
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
    "target_publication_id"
  );
});

it.each(["pub-give", undefined])(
  "已关联词形仍查询列表并回显当前选择（%s）",
  async (publicationId) => {
    const response = giveEntryResponse();
    search.mockClear();
    search.mockResolvedValue({
      ...response,
      matches: publicationId
        ? response.matches.map((candidate) => ({
            ...candidate,
            senses: []
          }))
        : []
    });
    get.mockResolvedValue({
      word: {
        id: "entry-give",
        presentation: { label: "give" },
        forms: {
          pos: [
            {
              pos_id: "pos-give",
              pos: "verb",
              forms: [
                {
                  id: "form-give",
                  form_type: "base",
                  regional_variants: {
                    mode: "common",
                    common: {
                      id: "variant-give",
                      dialect: "common",
                      spelling: "give"
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    });
    const onSelect = vi.fn();
    render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <V3GrammarFormPicker
          kind="word"
          segments={[segments[0]!]}
          selected={{
            id: "link-give",
            source_segments: [segments[0]!],
            target_word_id: "entry-give",
            target_publication_id: publicationId,
            target_pos_id: "pos-give",
            target_form_id: "form-give",
            target_variant_id: "variant-give",
            target_dialect: "common"
          }}
          onSelect={onSelect}
        />
      </ConfigProvider>
    );
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "give",
          kind: "word"
        })
      )
    );
    expect(search.mock.lastCall?.[0]).toHaveProperty("include_drafts", true);
    expect(screen.queryByText("显示草稿候选")).toBeNull();
    const form = await screen.findByText(/原形 give/);
    expect(form.closest(".ant-cascader-menu-item")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(form);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText("给；交给")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "清除关联" }));
    expect(onSelect).not.toHaveBeenCalled();
    const confirmation = await screen.findByRole("dialog", {
      name: "清除词形关联？"
    });
    await waitFor(() => expect(confirmation).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /^取\s*消$/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(form.closest(".ant-cascader-menu-item")).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "清除关联" }));
    fireEvent.click(await screen.findByRole("button", { name: /^清\s*除$/ }));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  }
);

it("切换词形需确认，取消保留原关联，重复选择当前词形不提示", async () => {
  const response = giveEntryResponse();
  const alternative = {
    ...response.matches[0]!.forms[0]!,
    variant_id: "variant-give-us",
    dialect: "us" as const
  };
  search.mockResolvedValue({
    ...response,
    matches: response.matches.map((candidate) => ({
      ...candidate,
      forms: [...candidate.forms, alternative]
    }))
  });
  const original: GrammarFormLinkV3 = {
    id: "link-give",
    source_segments: [segments[0]!],
    target_word_id: "entry-give",
    target_publication_id: "pub-give",
    target_pos_id: "pos-give",
    target_form_id: "form-give",
    target_variant_id: "variant-give",
    target_dialect: "common"
  };
  const onSelect = vi.fn();
  function Host() {
    const [selected, setSelected] = useState<GrammarFormLinkV3 | undefined>(
      original
    );
    return (
      <V3GrammarFormPicker
        kind="word"
        segments={original.source_segments}
        selected={selected}
        onSelect={(next) => {
          onSelect(next);
          setSelected(next);
        }}
      />
    );
  }
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <Host />
    </ConfigProvider>
  );
  const alternativeLabel = await screen.findByText("原形 give · 美式");
  fireEvent.click(alternativeLabel);
  expect(onSelect).not.toHaveBeenCalled();
  const confirmation = await screen.findByRole("dialog", {
    name: "切换词形关联？"
  });
  await waitFor(() => expect(confirmation).toBeVisible());
  expect(
    screen.getByText("原形 give · 英美通用 → 原形 give · 美式")
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^取\s*消$/ }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByText("已关联 · 英美通用")).toBeVisible();
  expect(
    screen.getByText("原形 give · 英美通用").closest(".ant-cascader-menu-item")
  ).toHaveAttribute("aria-checked", "true");
  fireEvent.click(alternativeLabel);
  fireEvent.click(await screen.findByRole("button", { name: /^切\s*换$/ }));
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        source_segments: original.source_segments,
        target_word_id: "entry-give",
        target_publication_id: "pub-give",
        target_form_id: "form-give",
        target_variant_id: "variant-give-us",
        target_dialect: "us"
      })
    )
  );
  expect(screen.getByText("已关联 · 美式")).toBeVisible();
  expect(alternativeLabel.closest(".ant-cascader-menu-item")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  fireEvent.click(alternativeLabel);
  expect(onSelect).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "切换词形关联？" })
    ).not.toBeInTheDocument()
  );
});

it.each(["word", "phrase"] as const)(
  "释义允许直接关联当前草稿 %s，不提供待关联入口",
  async (kind) => {
    const response = kind === "word" ? giveEntryResponse() : phraseResponse();
    const candidate = response.matches[0]!;
    search.mockResolvedValue({
      ...response,
      matches: [
        {
          ...draftify(candidate),
          senses: candidate.senses.map((sense) => ({
            ...draftify(sense),
            component_usages: []
          }))
        }
      ]
    });
    const onSelect = vi.fn();
    render(
      <V3TextAssociationPicker
        kind={kind}
        wordId={candidate.entry_id}
        segments={kind === "word" ? [segments[0]!] : segments}
        onSelect={onSelect}
      />
    );
    await waitFor(() => {
      fireEvent.click(column(0).getByText(candidate.headword, { exact: true }));
      expect(column(1).getByText(`原形 ${candidate.headword}`)).toBeVisible();
    });
    fireEvent.click(column(1).getByText(`原形 ${candidate.headword}`));
    fireEvent.click(column(2).getByText(candidate.senses[0]!.gloss));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        target_word_id: candidate.entry_id,
        target_sense_id: candidate.senses[0]!.sense_id,
        source_segments: kind === "word" ? [segments[0]!] : segments
      })
    );
    expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
      "target_publication_id"
    );
    expect(onSelect.mock.lastCall![0]).not.toHaveProperty("via_phrase");
    expect(screen.queryByText(/待关联/)).not.toBeInTheDocument();
  }
);

it("自关联不展示旧发布词义，但其他词条仍可选择发布内容", async () => {
  const response = giveEntryResponse();
  const published = response.matches[0]!;
  const current = {
    ...draftify(published),
    senses: published.senses.map(draftify)
  };
  search.mockResolvedValue({
    ...response,
    matches: [
      {
        ...published,
        senses: [
          {
            ...published.senses[0]!,
            sense_id: "removed-sense",
            gloss: "草稿已删除的词义"
          }
        ]
      },
      current,
      { ...published, entry_id: "other-give", headword: "另一个 give" }
    ]
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="word"
      wordId="entry-give"
      segments={[segments[0]!]}
      onSelect={onSelect}
    />
  );
  await selectGive();
  expect(screen.queryByText("草稿已删除的词义")).not.toBeInTheDocument();
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
    "target_publication_id"
  );
  fireEvent.click(column(0).getByText("另一个 give", { exact: true }));
  fireEvent.click(column(1).getByText("原形 give", { exact: true }));
  fireEvent.click(column(2).getByText("给；交给"));
  expect(onSelect.mock.lastCall![0].target_publication_id).toBe("pub-give");
});

it.each(["sense", "variant", "binding"] as const)(
  "自关联按当前未保存的 %s 变化过滤候选，恢复后可选择",
  async (change) => {
    const response = giveEntryResponse();
    const candidate = response.matches[0]!;
    search.mockResolvedValue({
      ...response,
      matches: [
        { ...draftify(candidate), senses: candidate.senses.map(draftify) }
      ]
    });
    const forms = formsFixture({
      pos_id: "pos-give",
      pos: "verb",
      forms: [
        commonFormFixture({
          id: "form-give",
          variant_id: "variant-give",
          spelling: "give"
        })
      ]
    });
    const meanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [],
      pos: [
        {
          pos_id: "pos-give",
          grammar_structures: [],
          senses: [
            {
              id: "sense-give-1",
              sub_pos: "",
              level: "A1",
              depends_on_context: false,
              sentences: [],
              relations: [],
              definitions: [
                {
                  id: "definition-give",
                  level: "A1",
                  definition_mode: "zh_definition",
                  content_id: "content-give",
                  content: { version: 2, text: "本地更新词义", annotations: [] }
                }
              ]
            }
          ]
        }
      ]
    };
    const editedForms = structuredClone(forms);
    const editedMeanings = structuredClone(meanings);
    if (change === "sense") editedMeanings.pos[0]!.senses = [];
    if (change === "variant") {
      const variant = editedForms.pos[0]!.forms[0]!.regional_variants;
      if (variant.mode === "common") variant.common.id = "replacement-variant";
    }
    if (change === "binding")
      editedForms.pos[0]!.form_groups[0]!.scope = "dedicated";
    const onSelect = vi.fn();
    const { rerender } = render(
      <V3TextAssociationPicker
        kind="word"
        wordId="entry-give"
        forms={editedForms}
        meanings={editedMeanings}
        segments={[segments[0]!]}
        onSelect={onSelect}
      />
    );
    if (change === "variant") {
      expect(await screen.findByText("没有匹配的词条")).toBeVisible();
    } else {
      await waitFor(() =>
        expect(
          document.querySelector(".ant-cascader-menu-item-content")
        ).not.toBeNull()
      );
      fireEvent.click(
        document.querySelector(".ant-cascader-menu-item-content")!
      );
      const row = screen.queryByText("原形 give", { exact: true });
      if (row) fireEvent.click(row);
    }
    expect(screen.queryByText("本地更新词义")).not.toBeInTheDocument();
    expect(screen.queryByText("给；交给")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    rerender(
      <V3TextAssociationPicker
        kind="word"
        wordId="entry-give"
        forms={forms}
        meanings={meanings}
        segments={[segments[0]!]}
        onSelect={onSelect}
      />
    );
    fireEvent.click(column(0).getByText("give", { exact: true }));
    fireEvent.click(column(1).getByText("原形 give", { exact: true }));
    fireEvent.click(column(2).getByText("本地更新词义"));
    expect(onSelect.mock.lastCall![0].target_gloss).toBe("本地更新词义");
    expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
      "target_publication_id"
    );
  }
);

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
      match: "exact"
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

async function selectPhrase(gloss = "放弃") {
  await waitFor(() => {
    fireEvent.click(column(0).getByText("give up", { exact: true }));
    expect(column(1).getByText("原形 give up")).toBeVisible();
  });
  fireEvent.click(column(1).getByText("原形 give up"));
  fireEvent.click(column(2).getByText(gloss));
}

it("短语直接选择词形词义，已关联后只能查看和清除", async () => {
  search.mockResolvedValue(phraseResponse());
  const onSelect = vi.fn();
  const { rerender } = render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await selectPhrase();
  expect(document.querySelectorAll(".ant-cascader-menu")).toHaveLength(3);
  expect(onSelect).toHaveBeenLastCalledWith(
    expect.objectContaining({
      source_segments: segments,
      target_word_id: "phrase",
      target_publication_id: "phrase-pub",
      target_sense_id: "phrase-sense"
    })
  );
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty("via_phrase");
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
  expect(screen.getByText(/已关联：give up/)).toBeVisible();
  expect(search).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("清除关联"));
  expect(onSelect).toHaveBeenLastCalledWith(undefined);
});

it("关联短语不依赖成分用词，只检索短语且包含草稿", async () => {
  const response = phraseResponse();
  response.matches.forEach((candidate) =>
    candidate.senses.forEach((sense) => {
      sense.component_usages = [];
    })
  );
  search.mockClear();
  search.mockResolvedValue({
    ...response,
    matches: [...giveEntryResponse().matches, ...response.matches]
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await selectPhrase();
  expect(search).toHaveBeenCalledTimes(1);
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
  expect(onSelect.mock.lastCall![0].target_word_id).toBe("phrase");
  expect(screen.queryByText(/待关联/)).not.toBeInTheDocument();
});

it("短语查询失败不提交关联，可原位重试后继续选择", async () => {
  search.mockRejectedValue(new Error("offline"));
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await screen.findByRole("button", { name: "重新加载" });
  expect(onSelect).not.toHaveBeenCalled();
  search.mockResolvedValue(phraseResponse());
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  await selectPhrase();
  expect(onSelect.mock.lastCall![0].target_sense_id).toBe("phrase-sense");
});

it("多个短语词义保留所选词义身份，不转关联到同名成分", async () => {
  const response = phraseResponse();
  for (const candidate of response.matches) {
    candidate.senses.push({
      ...candidate.senses[0]!,
      sense_id: "second-sense",
      gloss: "交出"
    });
  }
  search.mockResolvedValue(response);
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await selectPhrase("交出");
  expect(onSelect.mock.lastCall![0]).toMatchObject({
    target_word_id: "phrase",
    target_sense_id: "second-sense"
  });
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty("via_phrase");
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

it("草稿短语直接关联，不写发布版本或成分来源", async () => {
  const response = phraseResponse();
  search.mockResolvedValue({
    ...response,
    matches: response.matches.map((candidate) => ({
      ...draftify(candidate),
      senses: candidate.senses.map(draftify)
    }))
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  await selectPhrase();
  expect(column(0).getByText("草稿")).toBeVisible();
  expect(onSelect.mock.lastCall![0]).toMatchObject({
    target_word_id: "phrase",
    target_sense_id: "phrase-sense"
  });
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty(
    "target_publication_id"
  );
  expect(onSelect.mock.lastCall![0]).not.toHaveProperty("via_phrase");
});

it("短语后页词义可直接关联，翻页仍包含草稿", async () => {
  search.mockClear();
  search.mockImplementation(async (input) => {
    const response = phraseResponse();
    if (!input.cursor)
      return { ...response, next_cursor: "page-2", truncated: true };
    return {
      ...response,
      matches: response.matches.map((candidate) => ({
        ...candidate,
        senses: [
          {
            ...candidate.senses[0]!,
            sense_id: "later-sense",
            gloss: "后页词义"
          }
        ]
      }))
    };
  });
  const onSelect = vi.fn();
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={onSelect}
    />
  );
  fireEvent.click(await screen.findByRole("button", { name: /加载更多/ }));
  await waitFor(() =>
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "page-2", include_drafts: true })
    )
  );
  await selectPhrase("后页词义");
  expect(onSelect.mock.lastCall![0]).toMatchObject({
    target_word_id: "phrase",
    target_sense_id: "later-sense"
  });
});

it.each(["word", "phrase"] as const)(
  "%s 关联按词形筛选：通用全义、专用多义、同拼写不串组",
  async (kind) => {
    const candidate: PublishedSentenceTargetCandidateV3 = {
      ...giveEntryResponse().matches[0]!,
      senses: [
        ...giveEntryResponse().matches[0]!.senses,
        ...[2, 3].map((index) => ({
          ...giveEntryResponse().matches[0]!.senses[0]!,
          sense_id: `sense-give-${index}`,
          gloss: `专用词义 ${index}`
        }))
      ]
    };
    const general = candidate.forms[0]!;
    general.allowed_sense_ids = candidate.senses.map((sense) => sense.sense_id);
    candidate.forms.push(
      {
        ...general,
        form_id: "dedicated-form",
        variant_id: "dedicated-variant",
        base_form_ids: ["dedicated-form"],
        allowed_sense_ids: ["sense-give-2", "sense-give-3"]
      },
      {
        ...general,
        form_id: "empty-form",
        variant_id: "empty-variant",
        spelling: "unused",
        base_form_ids: ["empty-form"],
        allowed_sense_ids: []
      }
    );
    const headword = kind === "word" ? "give" : "give up";
    candidate.kind = kind;
    candidate.headword = headword;
    for (const form of candidate.forms) {
      if (form.spelling === "give") form.spelling = headword;
    }
    search.mockResolvedValue({ ...giveEntryResponse(), matches: [candidate] });
    const onSelect = vi.fn();
    render(
      <V3TextAssociationPicker
        kind={kind}
        segments={kind === "word" ? [segments[0]!] : segments}
        onSelect={onSelect}
      />
    );
    await waitFor(() => {
      fireEvent.click(column(0).getByText(headword, { exact: true }));
      expect(column(1).getAllByText(`原形 ${headword}`)).toHaveLength(2);
    });
    const formColumn = 1;
    fireEvent.click(column(formColumn).getAllByText(`原形 ${headword}`)[0]!);
    expect(column(formColumn + 1).getByText("给；交给")).toBeVisible();
    expect(column(formColumn + 1).getByText("专用词义 2")).toBeVisible();
    expect(column(formColumn + 1).getByText("专用词义 3")).toBeVisible();
    fireEvent.click(column(formColumn).getAllByText(`原形 ${headword}`)[1]!);
    expect(
      column(formColumn + 1).queryByText("给；交给")
    ).not.toBeInTheDocument();
    expect(column(formColumn + 1).getByText("专用词义 3")).toBeVisible();
    expect(column(formColumn).queryByText(/unused/)).not.toBeInTheDocument();
    fireEvent.click(column(formColumn + 1).getByText("专用词义 2"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        target_form_id: "dedicated-form",
        target_sense_id: "sense-give-2",
        target_base_form_id: "dedicated-form"
      })
    );
  }
);

it("关联短语的命中词形没有可用词义时不能选择", async () => {
  const response = phraseResponse();
  const matches: PublishedSentenceTargetCandidateV3[] = response.matches.map(
    (candidate) => ({
      ...candidate,
      forms: candidate.forms.map((form) => ({ ...form, allowed_sense_ids: [] }))
    })
  );
  search.mockResolvedValue({ ...response, matches });
  render(
    <V3TextAssociationPicker
      kind="phrase"
      segments={segments}
      onSelect={vi.fn()}
    />
  );
  await waitFor(() => {
    fireEvent.click(column(0).getByText("give up", { exact: true }));
    expect(column(1).getByText(/原形 give up/)).toBeVisible();
  });
  const item = column(1).getByText(/原形 give up/);
  expect(item.closest(".ant-cascader-menu-item")).toHaveClass(
    "ant-cascader-menu-item-disabled"
  );
});
