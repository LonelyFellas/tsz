import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import type { AdminWordV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import type { V3WordRequests } from "../api";
import { V3PendingSentenceAssociationsPanel } from "./V3PendingSentenceAssociationsPanel";

const word: AdminWordV3 = {
  schema_version: 3 as const,
  id: "target-entry",
  language: "en" as const,
  kind: "phrase" as const,
  status: "published" as const,
  revision: 7,
  lifecycle_revision: 3,
  published_revision: 7,
  has_unpublished_changes: false,
  presentation: {
    label: "center of the wall",
    matched_surfaces: ["center of the wall"],
    strategy_version: "test"
  },
  capabilities: {
    publication: { mode: "migration_canary" as const, whitelisted: true },
    pronunciation_normalization_version: "nfkc_trim_lower_v1" as const
  },
  forms: {
    pos: [
      {
        pos_id: "phrase-pos",
        pos: "noun",
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "unified"
        },
        forms: [
          {
            id: "phrase-form",
            form_type: "base",
            regional_variants: {
              mode: "common",
              common: {
                id: "phrase-variant",
                dialect: "common",
                spelling: "center of the wall",
                origin: "manual",
                pronunciations: [],
                component_usages: []
              }
            }
          }
        ],
        form_groups: [
          {
            id: "phrase-group",
            is_regular: true,
            members: [{ id: "phrase-membership", form_id: "phrase-form" }]
          }
        ]
      }
    ]
  },
  meanings: {
    sense_groups: [],
    pos: [
      {
        pos_id: "phrase-pos",
        grammar_structures: [],
        senses: [
          {
            id: "target-sense",
            sub_pos: "phrase",
            level: "B1",
            depends_on_context: false,
            definitions: [
              {
                id: "definition-1",
                level: "B1",
                definition_mode: "zh_definition",
                content_id: "definition-content-1",
                content: {
                  version: 2,
                  text: "墙的中心位置",
                  annotations: []
                }
              }
            ],
            sentences: [],
            relations: []
          }
        ]
      }
    ]
  },
  completed_steps: ["basics", "forms", "meanings"],
  max_reachable_step: "preview",
  created_by: "admin-1",
  created_at: "2026-08-30T00:00:00Z",
  updated_at: "2026-08-30T00:00:00Z",
  published_at: "2026-08-30T00:00:00Z"
};

describe("V3PendingSentenceAssociationsPanel", () => {
  it("加载目标词条 Pending，选择具体词义后携带 owner revision 认领", async () => {
    const first = {
      association_id: "association-1",
      owner_entry_id: "owner-entry",
      owner_entry_revision: 4,
      owner_lifecycle_revision: 2,
      sentence_id: "sentence-1",
      source_dialect: "common" as const,
      source_segments: [
        {
          start: 22,
          end: 40,
          surface: "center of the wall"
        }
      ],
      sentence_text: "It is centered on the center of the wall.",
      pending_target_kind: "phrase" as const,
      pending_target_headword: "center of the wall",
      pending_target_gloss: "墙的中心位置"
    };
    const listPendingSentenceAssociations = vi
      .fn()
      .mockResolvedValueOnce({
        results: [first],
        total: 2,
        next_cursor: "cursor-1"
      })
      .mockResolvedValueOnce({
        results: [
          {
            ...first,
            association_id: "association-2",
            sentence_id: "sentence-2",
            sentence_text: "The center of the wall is marked."
          }
        ],
        total: 2,
        next_cursor: null
      });
    const claimPendingSentenceAssociation = vi
      .fn()
      .mockResolvedValue({ word: { ...word, id: "owner-entry" } });
    const requests = {
      listPendingSentenceAssociations,
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "target-publication",
            entry_id: word.id,
            is_current: true,
            schema_version: 3
          }
        ]
      }),
      claimPendingSentenceAssociation
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel requests={requests} word={word} />
      </AntApp>
    );

    expect(await screen.findAllByText("center of the wall")).toHaveLength(1);
    expect(screen.getAllByText("待认领")).not.toHaveLength(0);
    expect(document.body).not.toHaveTextContent(/\b(?:Linked|Pending)\b/u);
    expect(listPendingSentenceAssociations).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    await waitFor(() =>
      expect(listPendingSentenceAssociations).toHaveBeenNthCalledWith(
        2,
        "target-entry",
        {
          page_size: 20,
          cursor: "cursor-1"
        }
      )
    );
    expect(await screen.findAllByText("center of the wall")).toHaveLength(2);
    fireEvent.mouseDown(
      screen.getByLabelText("为待认领例句 association-1 选择具体词义")
    );
    fireEvent.click(screen.getByText("名词 · 释义 1 · 墙的中心位置"));
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "正式认领" })
        .find((button) => !button.hasAttribute("disabled"))!
    );

    await waitFor(() =>
      expect(claimPendingSentenceAssociation).toHaveBeenCalledWith(
        "owner-entry",
        "association-1",
        expect.any(String),
        {
          target_word_id: "target-entry",
          target_sense_id: "target-sense",
          target_publication_id: "target-publication",
          target_form_variant_id: "phrase-variant",
          base_owner_entry_revision: 4,
          base_owner_lifecycle_revision: 2
        }
      )
    );
    expect(screen.getByText("The center of the wall is marked.")).toBeVisible();
  });

  it("同拍重复点击只发送一次认领并复用单个幂等命令", async () => {
    const item = {
      association_id: "association-locked",
      owner_entry_id: "owner-entry",
      owner_entry_revision: 4,
      owner_lifecycle_revision: 2,
      sentence_id: "sentence-locked",
      source_dialect: "common" as const,
      source_segments: [{ start: 0, end: 6, surface: "center" }],
      sentence_text: "Center appears here.",
      pending_target_kind: "phrase" as const,
      pending_target_headword: "center of the wall"
    };
    let resolveClaim: (() => void) | undefined;
    const claimPendingSentenceAssociation = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveClaim = () =>
            resolve({ word: { ...word, id: "owner-entry" } });
        })
    );
    const requests = {
      listPendingSentenceAssociations: vi.fn().mockResolvedValue({
        results: [item],
        total: 1,
        next_cursor: null
      }),
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "target-publication",
            entry_id: word.id,
            is_current: true,
            schema_version: 3
          }
        ]
      }),
      claimPendingSentenceAssociation
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={{ ...word, kind: "word" }}
        />
      </AntApp>
    );
    await screen.findByText("Center appears here.");
    fireEvent.mouseDown(
      screen.getByLabelText("为待认领例句 association-locked 选择具体词义")
    );
    fireEvent.click(screen.getByText("名词 · 释义 1 · 墙的中心位置"));
    const claim = screen.getByRole("button", { name: "正式认领" });
    fireEvent.click(claim);
    fireEvent.click(claim);
    expect(claimPendingSentenceAssociation).toHaveBeenCalledTimes(1);
    resolveClaim?.();
    await waitFor(() =>
      expect(screen.queryByText("Center appears here.")).toBeNull()
    );
  });

  it("word 同拼写多 variant 时要求显式选择并提交 current publication", async () => {
    const targetWord = structuredClone(word);
    targetWord.kind = "word";
    targetWord.presentation.label = "center";
    targetWord.presentation.matched_surfaces = ["center"];
    targetWord.forms.pos[0]!.forms[0]!.regional_variants = {
      mode: "uk_us",
      uk: {
        id: "center-uk-variant",
        dialect: "uk",
        spelling: "center",
        origin: "manual",
        pronunciations: []
      },
      us: {
        id: "center-us-variant",
        dialect: "us",
        spelling: "center",
        origin: "manual",
        pronunciations: []
      }
    };
    const claimPendingSentenceAssociation = vi
      .fn()
      .mockResolvedValue({ word: { ...targetWord, id: "owner-entry" } });
    const requests = {
      listPendingSentenceAssociations: vi.fn().mockResolvedValue({
        results: [
          {
            association_id: "association-word",
            owner_entry_id: "owner-entry",
            owner_entry_revision: 4,
            owner_lifecycle_revision: 2,
            sentence_id: "sentence-word",
            source_dialect: "us",
            source_segments: [{ start: 0, end: 6, surface: "center" }],
            sentence_text: "Center the text.",
            pending_target_kind: "word",
            pending_target_headword: "center"
          }
        ],
        total: 1,
        next_cursor: null
      }),
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "target-word-publication",
            entry_id: targetWord.id,
            is_current: true,
            schema_version: 3
          }
        ]
      }),
      claimPendingSentenceAssociation
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={targetWord}
        />
      </AntApp>
    );

    await screen.findByText("Center the text.");
    fireEvent.mouseDown(
      screen.getByLabelText("为待认领例句 association-word 选择具体词义")
    );
    fireEvent.click(screen.getByText("名词 · 释义 1 · 墙的中心位置"));
    expect(screen.getByRole("button", { name: "正式认领" })).toBeDisabled();
    fireEvent.mouseDown(
      screen.getByLabelText("为待认领例句 association-word 选择具体词形")
    );
    fireEvent.click(screen.getByText("名词 · 美式 · 原形 · center"));
    fireEvent.click(screen.getByRole("button", { name: "正式认领" }));

    await waitFor(() =>
      expect(claimPendingSentenceAssociation).toHaveBeenCalledWith(
        "owner-entry",
        "association-word",
        expect.any(String),
        expect.objectContaining({
          target_word_id: "target-entry",
          target_sense_id: "target-sense",
          target_publication_id: "target-word-publication",
          target_form_variant_id: "center-us-variant"
        })
      )
    );
  });

  it("multi-POS 同拼写 variant 只跟随所选 sense POS", async () => {
    const targetWord = structuredClone(word);
    targetWord.kind = "word";
    targetWord.forms.pos[0]!.pos = "noun";
    targetWord.forms.pos.push({
      pos_id: "verb-pos",
      pos: "verb",
      dialect_rules: {
        spelling_mode: "unified",
        phonetic_mode: "unified"
      },
      forms: [
        {
          id: "verb-form",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: "verb-variant",
              dialect: "common",
              spelling: "center of the wall",
              origin: "manual",
              pronunciations: []
            }
          }
        }
      ],
      form_groups: []
    });
    targetWord.meanings.pos.push({
      pos_id: "verb-pos",
      grammar_structures: [],
      senses: [
        {
          id: "verb-sense",
          sub_pos: "verb",
          level: "B1",
          depends_on_context: false,
          definitions: [],
          sentences: [],
          relations: []
        }
      ]
    });
    const claimPendingSentenceAssociation = vi.fn().mockResolvedValue({
      word: { ...targetWord, id: "owner-entry" }
    });
    const requests = {
      listPendingSentenceAssociations: vi.fn().mockResolvedValue({
        results: [
          {
            association_id: "association-multi-pos",
            owner_entry_id: "owner-entry",
            owner_entry_revision: 4,
            owner_lifecycle_revision: 2,
            sentence_id: "sentence-multi-pos",
            source_dialect: "common",
            source_segments: [
              { start: 0, end: 18, surface: "center of the wall" }
            ],
            sentence_text: "Center of the wall.",
            pending_target_kind: "word",
            pending_target_headword: "center of the wall"
          }
        ],
        total: 1,
        next_cursor: null
      }),
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "multi-pos-publication",
            entry_id: targetWord.id,
            is_current: true,
            schema_version: 3
          }
        ]
      }),
      claimPendingSentenceAssociation
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={targetWord}
        />
      </AntApp>
    );
    await screen.findByText("Center of the wall.");
    const senseSelect = screen.getByLabelText(
      "为待认领例句 association-multi-pos 选择具体词义"
    );
    fireEvent.mouseDown(senseSelect);
    fireEvent.click(screen.getByText(/动词 · 释义 1/u));
    expect(
      screen.queryByLabelText("为待认领例句 association-multi-pos 选择具体词形")
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "正式认领" }));
    await waitFor(() =>
      expect(claimPendingSentenceAssociation).toHaveBeenCalledWith(
        "owner-entry",
        "association-multi-pos",
        expect.any(String),
        expect.objectContaining({
          target_sense_id: "verb-sense",
          target_publication_id: "multi-pos-publication",
          target_form_variant_id: "verb-variant"
        })
      )
    );
  });

  it("目标词条有未发布改动时不展示可能失真的 publication 词义", () => {
    const requests = {
      listPendingSentenceAssociations: vi.fn()
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={{ ...word, has_unpublished_changes: true }}
        />
      </AntApp>
    );
    expect(requests.listPendingSentenceAssociations).not.toHaveBeenCalled();
    expect(screen.queryByText("待认领多维例句")).toBeNull();
  });

  it("独立 capability 关闭时不查询也不展示 Pending", () => {
    const requests = {
      listPendingSentenceAssociations: vi.fn()
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={{
            ...word,
            capabilities: {
              ...word.capabilities,
              sentence_associations: false
            }
          }}
        />
      </AntApp>
    );
    expect(requests.listPendingSentenceAssociations).not.toHaveBeenCalled();
    expect(screen.queryByText("待认领多维例句")).toBeNull();
  });
});
