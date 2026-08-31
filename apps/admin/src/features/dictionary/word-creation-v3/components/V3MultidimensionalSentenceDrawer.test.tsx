import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { V3MultidimensionalSentenceDrawer } from "./V3MultidimensionalSentenceDrawer";

const relatedSearchAny = vi.hoisted(() => vi.fn());
const resolveSentenceTargets = vi.hoisted(() => vi.fn());

vi.mock("../../api", () => ({
  useRelatedSearchAny: relatedSearchAny
}));
vi.mock("../api", () => ({
  createV3WordRequests: () => ({
    resolveSentenceTargets
  })
}));

function emptySearch() {
  return {
    exact: { data: undefined, isFetching: false },
    contains: { data: undefined, isFetching: false }
  };
}

function idSequence() {
  let index = 0;
  return () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`;
}

describe("V3MultidimensionalSentenceDrawer", () => {
  beforeEach(() => {
    relatedSearchAny.mockReturnValue(emptySearch());
    resolveSentenceTargets.mockImplementation(
      async (input: {
        sentence_text: string;
        selected_segments?: Array<{
          start: number;
          end: number;
          surface: string;
        }>;
      }) => ({
        schema_version: 3,
        sentence_hash: "hash",
        discovery_generation: 1,
        completeness: "complete",
        range_results: input.selected_segments
          ? [
              {
                source_segments: input.selected_segments,
                segments_fingerprint: "selected-range",
                normalized_surface: input.selected_segments
                  .map((segment) => segment.surface)
                  .join(" "),
                published_total: 0,
                published_matches: [],
                draft_matches: []
              }
            ]
          : []
      })
    );
  });

  it("连续短语保存为带预填词义的 Pending，成功前不关闭", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={onClose}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    expect(screen.getByText("正式能力")).toBeVisible();
    expect(screen.queryByText("保存说明")).toBeNull();
    const saveHelp = screen.getByRole("button", { name: "查看保存说明" });
    expect(saveHelp).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(saveHelp);
    expect(screen.getByText("保存说明")).toBeVisible();
    const collapseSaveHelp = screen.getByRole("button", {
      name: "收起保存说明"
    });
    expect(collapseSaveHelp).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseSaveHelp);
    expect(screen.queryByText("保存说明")).toBeNull();
    expect(
      screen.getByText("至少添加一条已关联词义或待关联词条")
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b(?:Linked|Pending)\b/u);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "It is centered on the center of the wall." }
    });
    fireEvent.change(screen.getByLabelText("中阶中文译文"), {
      target: { value: "它位于墙的中央。" }
    });
    fireEvent.click(screen.getByLabelText("手动选择"));
    for (const label of [
      "选择第 6 个词 center",
      "选择第 7 个词 of",
      "选择第 8 个词 the",
      "选择第 9 个词 wall"
    ]) {
      fireEvent.click(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "添加待关联词条" })
    );
    expect(
      screen.getByText("待关联").closest(".v3-sentence-drawer-association")
    ).toHaveTextContent("center of the wall");
    expect(document.body).not.toHaveTextContent(/\b(?:Linked|Pending)\b/u);
    fireEvent.change(screen.getByLabelText(/编辑待关联词义/u), {
      target: { value: "手动调整后的墙中心位置" }
    });
    expect(screen.getByLabelText(/编辑待关联词义/u)).toHaveValue(
      "手动调整后的墙中心位置"
    );
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sentence: expect.objectContaining({
          level: "B1",
          links: [{ word_id: "word-1", sense_id: "sense-1", role: "head" }],
          zh_text: expect.objectContaining({ text: "它位于墙的中央。" })
        }),
        associations: [
          expect.objectContaining({
            source_dialect: "common",
            source_segments: [
              {
                start: 22,
                end: 40,
                surface: "center of the wall"
              }
            ],
            pending_target_kind: "phrase",
            pending_target_headword: "center of the wall",
            pending_target_gloss: "手动调整后的墙中心位置"
          })
        ]
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("单个不存在单词可保存为可编辑词义的 word Pending", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={vi.fn()}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "A rareword appears here." }
    });
    fireEvent.change(screen.getByLabelText("中阶中文译文"), {
      target: { value: "一个罕见词出现在这里。" }
    });
    fireEvent.click(screen.getByLabelText("手动选择"));
    fireEvent.click(screen.getByLabelText("选择第 2 个词 rareword"));
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "添加待关联词条" })
    );
    fireEvent.change(screen.getByLabelText(/编辑待关联词义/u), {
      target: { value: "手动调整的罕见词义" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        associations: [
          expect.objectContaining({
            source_dialect: "common",
            source_segments: [{ start: 2, end: 10, surface: "rareword" }],
            pending_target_kind: "word",
            pending_target_headword: "rareword",
            pending_target_gloss: "手动调整的罕见词义"
          })
        ]
      })
    );
  });

  it("中文译文可补齐初中高三档、独立编辑删除且至少保留一档", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={vi.fn()}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    expect(screen.getByLabelText("删除中阶中文译文")).toBeDisabled();
    expect(screen.getByText("中阶")).toBeVisible();
    expect(screen.queryByText("中阶（B1/B2）")).toBeNull();
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "A translated example." }
    });
    fireEvent.change(screen.getByLabelText("中阶中文译文"), {
      target: { value: "中阶译文" }
    });

    fireEvent.mouseDown(screen.getByLabelText("新增译文等级"));
    fireEvent.click(screen.getByText("初阶"));
    fireEvent.click(screen.getByRole("button", { name: "添加译文" }));
    fireEvent.change(screen.getByLabelText("初阶中文译文"), {
      target: { value: "初阶译文" }
    });

    fireEvent.mouseDown(screen.getByLabelText("新增译文等级"));
    fireEvent.click(screen.getByText("高阶"));
    fireEvent.click(screen.getByRole("button", { name: "添加译文" }));
    fireEvent.change(screen.getByLabelText("高阶中文译文"), {
      target: { value: "高阶译文" }
    });

    expect(screen.queryByLabelText("新增译文等级")).toBeNull();
    expect(screen.getByDisplayValue("初阶译文")).toBeVisible();
    expect(screen.getByDisplayValue("中阶译文")).toBeVisible();
    expect(screen.getByDisplayValue("高阶译文")).toBeVisible();
    expect(screen.queryByText("初阶（C1/C2）")).toBeNull();
    expect(screen.queryByText("高阶（A1/A2）")).toBeNull();

    fireEvent.click(screen.getByLabelText("手动选择"));
    fireEvent.click(screen.getByLabelText("选择第 2 个词 translated"));
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "添加待关联词条" })
    );
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sentence: expect.objectContaining({
          zh_text: expect.objectContaining({ text: "中阶译文" }),
          zh_translations: [
            expect.objectContaining({
              band: "c1_c2",
              content: expect.objectContaining({ text: "初阶译文" })
            }),
            expect.objectContaining({
              band: "b1_b2",
              content: expect.objectContaining({ text: "中阶译文" })
            }),
            expect.objectContaining({
              band: "a1_a2",
              content: expect.objectContaining({ text: "高阶译文" })
            })
          ]
        })
      })
    );

    fireEvent.click(screen.getByLabelText("删除中阶中文译文"));
    expect(screen.queryByLabelText("中阶中文译文")).toBeNull();
    expect(screen.getByLabelText("新增译文等级")).toBeVisible();
  });

  it("一键发现把唯一词义自动加入，并按最长短语覆盖内部单词", async () => {
    relatedSearchAny.mockReturnValue({
      exact: {
        data: {
          pages: [
            {
              results: [
                {
                  schema_version: 3,
                  entry_id: "target-entry",
                  kind: "phrase",
                  presentation: {
                    label: "center of the wall",
                    matched_surfaces: ["center of the wall"],
                    strategy_version: "test"
                  },
                  matches: [],
                  senses: [{ sense_id: "target-sense", gloss: "墙的中心位置" }]
                }
              ],
              total: 1,
              next_cursor: null
            }
          ]
        },
        isFetching: false
      },
      contains: { data: undefined, isFetching: false }
    });
    resolveSentenceTargets.mockResolvedValue({
      schema_version: 3,
      sentence_hash: "hash",
      discovery_generation: 2,
      completeness: "complete",
      range_results: [
        {
          source_segments: [
            { start: 22, end: 40, surface: "center of the wall" }
          ],
          segments_fingerprint: "published-phrase",
          normalized_surface: "center of the wall",
          published_total: 1,
          published_matches: [
            {
              entry_id: "target-entry",
              publication_id: "target-publication",
              pos_id: "target-pos",
              base_form_id: "target-base",
              headword: "center of the wall",
              pos: "短语",
              matched_form_id: "target-form",
              matched_variant_id: "target-variant",
              matched_dialect: "common",
              matched_form_type: "base",
              component_usages: [
                {
                  state: "resolved",
                  id: "component-center",
                  literal: "center",
                  target_word_id: "center-entry",
                  target_publication_id: "center-publication",
                  target_pos_id: "center-pos",
                  target_base_form_id: "center-base",
                  target_sense_id: "center-sense",
                  target_form_id: "center-form",
                  target_variant_id: "center-variant",
                  target_dialect: "us",
                  target_form_type: "base",
                  target_headword: "center",
                  target_gloss: "中心"
                },
                {
                  state: "unresolved",
                  id: "component-wall",
                  literal: "wall"
                }
              ],
              matches: [
                {
                  surface: "center of the wall",
                  normalized_surface: "center of the wall",
                  match_kind: "contiguous_phrase"
                }
              ],
              senses: [
                {
                  sense_id: "target-sense",
                  publication_id: "target-publication",
                  pos_id: "target-pos",
                  base_form_id: "target-base",
                  level: "B1",
                  gloss: "墙的中心位置"
                }
              ]
            }
          ],
          draft_matches: []
        },
        {
          source_segments: [{ start: 36, end: 40, surface: "wall" }],
          segments_fingerprint: "published-word",
          normalized_surface: "wall",
          published_total: 1,
          published_matches: [
            {
              entry_id: "wall-entry",
              publication_id: "wall-publication",
              pos_id: "wall-pos",
              base_form_id: "wall-base",
              headword: "wall",
              pos: "noun",
              matches: [
                {
                  surface: "wall",
                  normalized_surface: "wall",
                  match_kind: "word"
                }
              ],
              senses: [
                {
                  sense_id: "wall-sense",
                  publication_id: "wall-publication",
                  pos_id: "wall-pos",
                  base_form_id: "wall-base",
                  level: "A1",
                  gloss: "墙"
                }
              ]
            }
          ],
          draft_matches: []
        }
      ]
    });
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={vi.fn()}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "It is centered on the center of the wall." }
    });
    fireEvent.change(screen.getByLabelText("中阶中文译文"), {
      target: { value: "它位于墙的中央。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    expect((await screen.findAllByText("成分用词")).length).toBeGreaterThan(0);
    expect(
      screen.getByText("已关联").closest(".v3-sentence-drawer-association")
    ).toHaveTextContent("center of the wall");
    expect(screen.getAllByText("center").length).toBeGreaterThan(0);
    expect(screen.getAllByText("of").length).toBeGreaterThan(0);
    expect(screen.getAllByText("the").length).toBeGreaterThan(0);
    expect(screen.getAllByText("wall").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已关联")).toHaveLength(1);
    expect(screen.getByText(/center · 中心 · 美式 · 原形/)).toBeVisible();
    expect(screen.getAllByText("待选择词义")).not.toHaveLength(0);
    fireEvent.mouseDown(screen.getByLabelText("选择上下文关联词义"));
    fireEvent.click(
      screen.getAllByText("center of the wall · 墙的中心位置").at(-1)!
    );
    fireEvent.click(screen.getByRole("button", { name: "添加词义归属" }));
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sentence: expect.objectContaining({
          links: expect.arrayContaining([
            { word_id: "word-1", sense_id: "sense-1", role: "head" },
            {
              word_id: "target-entry",
              sense_id: "target-sense",
              role: "context"
            }
          ])
        }),
        associations: [
          expect.objectContaining({
            target_word_id: "target-entry",
            target_sense_id: "target-sense",
            target_publication_id: "target-publication",
            target_form_variant_id: "target-variant"
          })
        ]
      })
    );
  });

  it("一键发现遇到多词义时保持候选，不自动猜测关联", async () => {
    resolveSentenceTargets.mockResolvedValue({
      schema_version: 3,
      sentence_hash: "hash",
      discovery_generation: 3,
      completeness: "complete",
      range_results: [
        {
          source_segments: [{ start: 2, end: 10, surface: "location" }],
          segments_fingerprint: "ambiguous-location",
          normalized_surface: "location",
          published_total: 1,
          published_matches: [
            {
              entry_id: "location-entry",
              publication_id: "location-publication",
              pos_id: "location-pos",
              base_form_id: "location-base",
              headword: "location",
              pos: "noun",
              matches: [
                {
                  surface: "location",
                  normalized_surface: "location",
                  match_kind: "word"
                }
              ],
              senses: [
                {
                  sense_id: "location-sense-1",
                  publication_id: "location-publication",
                  pos_id: "location-pos",
                  base_form_id: "location-base",
                  level: "A1",
                  gloss: "地点"
                },
                {
                  sense_id: "location-sense-2",
                  publication_id: "location-publication",
                  pos_id: "location-pos",
                  base_form_id: "location-base",
                  level: "B1",
                  gloss: "外景地"
                }
              ]
            }
          ],
          draft_matches: []
        }
      ]
    });
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={vi.fn()}
          onSave={vi.fn().mockResolvedValue(undefined)}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "A location appears." }
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));

    expect(await screen.findByText("查看 2 个词义")).toBeVisible();
    expect(screen.queryByText("已关联")).toBeNull();
    expect(
      screen.getByText("至少添加一条已关联词义或待关联词条")
    ).toBeVisible();
  });

  it("正文变化后丢弃迟到发现结果，且不会污染本次关联", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    resolveSentenceTargets.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={vi.fn()}
          onSave={vi.fn()}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "A central location." }
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "The sentence changed." }
    });
    await act(async () => {
      resolveRequest?.({
        schema_version: 3,
        sentence_hash: "stale",
        discovery_generation: 3,
        completeness: "complete",
        range_results: [
          {
            source_segments: [
              { start: 2, end: 18, surface: "central location" }
            ],
            segments_fingerprint: "stale-range",
            normalized_surface: "central location",
            published_total: 1,
            published_matches: [
              {
                entry_id: "phrase-entry",
                publication_id: "phrase-publication",
                pos_id: "phrase-pos",
                base_form_id: "phrase-base",
                headword: "central location",
                pos: "noun",
                matched_form_id: "phrase-form",
                matched_variant_id: "phrase-variant",
                matched_dialect: "common",
                matched_form_type: "base",
                component_usages: [],
                matches: [
                  {
                    surface: "central location",
                    normalized_surface: "central location",
                    match_kind: "contiguous_phrase"
                  }
                ],
                senses: [
                  {
                    sense_id: "phrase-sense",
                    publication_id: "phrase-publication",
                    pos_id: "phrase-pos",
                    base_form_id: "phrase-base",
                    level: "B1",
                    gloss: "中心位置"
                  }
                ]
              }
            ],
            draft_matches: []
          }
        ]
      });
    });

    expect(screen.queryByText("已关联")).toBeNull();
    expect(
      screen.getByText("至少添加一条已关联词义或待关联词条")
    ).toBeVisible();
  });

  it("保存失败时保持抽屉与本地草稿，取消不调用保存", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("association failed"));
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          idFactory={idSequence()}
          onClose={onClose}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "A phrase here." }
    });
    fireEvent.change(screen.getByLabelText("中阶中文译文"), {
      target: { value: "这里有一个短语。" }
    });
    fireEvent.click(screen.getByLabelText("手动选择"));
    fireEvent.click(screen.getByLabelText("选择第 2 个词 phrase"));
    fireEvent.click(screen.getByLabelText("选择第 3 个词 here"));
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "添加待关联词条" })
    );
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));
    expect(await screen.findByText("association failed")).toBeVisible();
    expect(screen.getByDisplayValue("A phrase here.")).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^取\s?消$/u }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("编辑已有例句时还原服务端关联并保留稳定 ID", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCreatePendingTarget = vi.fn();
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          initialAssociations={[
            {
              id: "association-pending",
              association_schema_version: 3,
              origin: "manual",
              source_dialect: "common",
              source_segments: [
                {
                  start: 9,
                  end: 27,
                  surface: "center of the wall"
                }
              ],
              state: "pending",
              pending_target_kind: "phrase",
              pending_target_headword: "center of the wall",
              pending_target_gloss: "墙的中心位置"
            }
          ]}
          initialSentence={{
            id: "sentence-existing",
            level: "B2",
            en_text: {
              mode: "unified",
              common: {
                id: "sentence-en-existing",
                origin: "manual",
                value: {
                  version: 2,
                  text: "Find the center of the wall.",
                  annotations: []
                }
              }
            },
            zh_text_id: "sentence-zh-existing",
            zh_text: {
              version: 2,
              text: "找到墙的中心位置。",
              annotations: []
            },
            zh_translations: [
              {
                id: "sentence-zh-existing",
                band: "b1_b2",
                content: {
                  version: 2,
                  text: "找到墙的中心位置。",
                  annotations: []
                }
              }
            ],
            links: [{ word_id: "word-1", sense_id: "sense-1", role: "head" }]
          }}
          onClose={vi.fn()}
          onCreatePendingTarget={onCreatePendingTarget}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    expect(screen.getByText("编辑多维例句")).toBeVisible();
    expect(
      screen.getByDisplayValue("Find the center of the wall.")
    ).toBeVisible();
    expect(
      screen.getByText("待关联").closest(".v3-sentence-drawer-association")
    ).toHaveTextContent("center of the wall");
    fireEvent.click(screen.getByRole("button", { name: "创建目标短语" }));
    expect(onCreatePendingTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "association-pending",
        pending_target_headword: "center of the wall",
        pending_target_gloss: "墙的中心位置"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          sentence: expect.objectContaining({
            id: "sentence-existing",
            level: "B2",
            zh_text_id: "sentence-zh-existing"
          }),
          associations: [expect.objectContaining({ id: "association-pending" })]
        })
      )
    );
  });

  it("英美分栏正文只清理被编辑方言侧的关联", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          initialAssociations={[
            {
              id: "association-uk",
              association_schema_version: 3,
              origin: "manual",
              source_dialect: "uk",
              source_segments: [{ start: 5, end: 11, surface: "centre" }],
              state: "pending",
              pending_target_kind: "word",
              pending_target_headword: "centre"
            },
            {
              id: "association-us",
              association_schema_version: 3,
              origin: "manual",
              source_dialect: "us",
              source_segments: [{ start: 5, end: 11, surface: "center" }],
              state: "pending",
              pending_target_kind: "word",
              pending_target_headword: "center"
            }
          ]}
          initialSentence={{
            id: "sentence-regional",
            level: "B1",
            en_text: {
              mode: "distinguish",
              source_dialect: "uk",
              uk: {
                state: "ready",
                variant: {
                  id: "sentence-uk",
                  origin: "manual",
                  value: {
                    version: 2,
                    text: "Keep centre here.",
                    annotations: []
                  }
                }
              },
              us: {
                state: "ready",
                variant: {
                  id: "sentence-us",
                  origin: "manual",
                  value: {
                    version: 2,
                    text: "Keep center here.",
                    annotations: []
                  }
                }
              }
            },
            zh_text_id: "sentence-zh",
            zh_text: { version: 2, text: "把中心留在这里。", annotations: [] },
            zh_translations: [
              {
                id: "sentence-zh",
                band: "b1_b2",
                content: {
                  version: 2,
                  text: "把中心留在这里。",
                  annotations: []
                }
              }
            ],
            links: [{ word_id: "word-1", sense_id: "sense-1", role: "head" }]
          }}
          onClose={vi.fn()}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    fireEvent.mouseDown(screen.getByLabelText("英文例句方言侧"));
    fireEvent.click(screen.getByText("美式英文"));
    fireEvent.change(screen.getByLabelText("英文例句"), {
      target: { value: "Keep the center here." }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].associations).toEqual([
      expect.objectContaining({ id: "association-uk", source_dialect: "uk" })
    ]);
    expect(onSave.mock.calls[0]![0].sentence.en_text).toMatchObject({
      mode: "distinguish",
      uk: {
        state: "ready",
        variant: { value: { text: "Keep centre here." } }
      },
      us: {
        state: "ready",
        variant: { value: { text: "Keep the center here." } }
      }
    });
  });

  it("兼容 linked 缺 exact identity 时整组保存仍保留原关联", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AntApp>
        <V3MultidimensionalSentenceDrawer
          initialAssociations={[
            {
              id: "association-legacy-linked",
              association_schema_version: 3,
              origin: "manual",
              source_dialect: "common",
              source_segments: [{ start: 9, end: 15, surface: "center" }],
              state: "linked",
              target_word_id: "target-word",
              target_sense_id: "target-sense",
              target_component_usages: [],
              target_headword: "center",
              target_gloss: "中心",
              resolved_pos: "noun"
            }
          ]}
          initialSentence={{
            id: "sentence-legacy-linked",
            level: "B1",
            en_text: {
              mode: "unified",
              common: {
                id: "sentence-en-legacy",
                origin: "manual",
                value: {
                  version: 2,
                  text: "Find the center here.",
                  annotations: []
                }
              }
            },
            zh_text_id: "sentence-zh-legacy",
            zh_text: { version: 2, text: "在这里找到中心。", annotations: [] },
            zh_translations: [
              {
                id: "sentence-zh-legacy",
                band: "b1_b2",
                content: {
                  version: 2,
                  text: "在这里找到中心。",
                  annotations: []
                }
              }
            ],
            links: [{ word_id: "word-1", sense_id: "sense-1", role: "head" }]
          }}
          onClose={vi.fn()}
          onSave={onSave}
          open
          senseId="sense-1"
          wordId="word-1"
        />
      </AntApp>
    );

    expect(screen.getByText("center")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "保存例句与关联" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].associations).toEqual([
      {
        id: "association-legacy-linked",
        source_dialect: "common",
        source_segments: [{ start: 9, end: 15, surface: "center" }],
        target_word_id: "target-word",
        target_sense_id: "target-sense"
      }
    ]);
  });
});
