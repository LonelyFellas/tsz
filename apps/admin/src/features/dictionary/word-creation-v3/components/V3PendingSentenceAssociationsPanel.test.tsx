import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { HttpError } from "@tsz/api-client";
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
    const listPublications = vi.fn().mockResolvedValue({
      publications: [
        {
          publication_id: "target-publication",
          entry_id: word.id,
          publication_number: 1,
          source_revision: word.revision,
          published_by_admin_id: "admin-1",
          published_at: word.published_at,
          is_current: true,
          schema_version: 3,
          word
        }
      ]
    });
    const requests = {
      listPendingSentenceAssociations,
      listPublications,
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
      source_segments: [{ start: 0, end: 18, surface: "center of the wall" }],
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
            publication_number: 1,
            source_revision: word.revision,
            published_by_admin_id: "admin-1",
            published_at: word.published_at,
            is_current: true,
            schema_version: 3,
            word
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
            publication_number: 1,
            source_revision: targetWord.revision,
            published_by_admin_id: "admin-1",
            published_at: targetWord.published_at,
            is_current: true,
            schema_version: 3,
            word: targetWord
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
        {
          target_word_id: "target-entry",
          target_sense_id: "target-sense",
          target_publication_id: "target-word-publication",
          target_form_variant_id: "center-us-variant",
          base_owner_entry_revision: 4,
          base_owner_lifecycle_revision: 2
        }
      )
    );
  });

  it("multi-POS 同拼写 variant 只跟随所选 sense POS，切换后清除非法选择", async () => {
    const targetWord = structuredClone(word);
    targetWord.kind = "word";
    targetWord.forms.pos[0]!.pos = "noun";
    targetWord.forms.pos[0]!.forms.push({
      id: "noun-form-second",
      form_type: "base",
      regional_variants: {
        mode: "common",
        common: {
          id: "noun-variant-second",
          dialect: "common",
          spelling: "center of the wall",
          origin: "manual",
          pronunciations: []
        }
      }
    });
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
    fireEvent.click(screen.getByText(/名词 · 释义 1/u));
    const variantSelect = screen.getByLabelText(
      "为待认领例句 association-multi-pos 选择具体词形"
    );
    fireEvent.mouseDown(variantSelect);
    expect(screen.getAllByText(/名词 · 通用 · 原形/u)).toHaveLength(2);
    expect(screen.queryByText(/动词 · 通用 · 原形/u)).toBeNull();
    fireEvent.click(screen.getAllByText(/名词 · 通用 · 原形/u)[1]!);

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
          target_form_variant_id: "verb-variant"
        })
      )
    );
  });

  it.each([
    [new Error("claim conflict"), "claim conflict"],
    ["invalid claim", "例句关联认领失败"]
  ])(
    "claim 失败后刷新服务端列表并保留错误提示：%s",
    async (failure, message) => {
      const item = {
        association_id: "association-failed",
        owner_entry_id: "owner-entry",
        owner_entry_revision: 4,
        owner_lifecycle_revision: 2,
        sentence_id: "sentence-failed",
        source_dialect: "common" as const,
        source_segments: [{ start: 0, end: 18, surface: "center of the wall" }],
        sentence_text: "The center of the wall is marked.",
        pending_target_kind: "phrase" as const,
        pending_target_headword: "center of the wall"
      };
      const listPendingSentenceAssociations = vi
        .fn()
        .mockResolvedValueOnce({ results: [item], total: 1, next_cursor: null })
        .mockResolvedValueOnce({ results: [], total: 0, next_cursor: null });
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
        claimPendingSentenceAssociation: vi.fn().mockRejectedValue(failure)
      } as unknown as V3WordRequests;
      render(
        <AntApp>
          <V3PendingSentenceAssociationsPanel requests={requests} word={word} />
        </AntApp>
      );
      await screen.findByText(item.sentence_text);
      fireEvent.mouseDown(
        screen.getByLabelText("为待认领例句 association-failed 选择具体词义")
      );
      fireEvent.click(screen.getByText("名词 · 释义 1 · 墙的中心位置"));
      fireEvent.click(screen.getByRole("button", { name: "正式认领" }));

      expect(await screen.findByText(message)).toBeVisible();
      expect(listPendingSentenceAssociations).toHaveBeenCalledTimes(2);
    }
  );

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

  it("旧后端缺少 Pending 端点时静默隐藏，普通加载错误可重试", async () => {
    const hiddenRequests = {
      listPendingSentenceAssociations: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "not found")),
      listPublications: vi.fn().mockResolvedValue({ publications: [] })
    } as unknown as V3WordRequests;
    const hidden = render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={hiddenRequests}
          word={word}
        />
      </AntApp>
    );
    await waitFor(() =>
      expect(screen.queryByText("待认领多维例句")).toBeNull()
    );
    hidden.unmount();

    const unavailableRequests = {
      listPendingSentenceAssociations: vi
        .fn()
        .mockRejectedValue(new HttpError(503, "unavailable")),
      listPublications: vi.fn().mockResolvedValue({ publications: [] })
    } as unknown as V3WordRequests;
    const unavailable = render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={unavailableRequests}
          word={word}
        />
      </AntApp>
    );
    await waitFor(() =>
      expect(screen.queryByText("待认领多维例句")).toBeNull()
    );
    unavailable.unmount();

    const invalidRequests = {
      listPendingSentenceAssociations: vi.fn().mockRejectedValue("invalid"),
      listPublications: vi.fn().mockResolvedValue({ publications: [] })
    } as unknown as V3WordRequests;
    const invalid = render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={invalidRequests}
          word={word}
        />
      </AntApp>
    );
    expect(await screen.findByText("待认领例句加载失败")).toBeVisible();
    invalid.unmount();

    const failedList = vi
      .fn()
      .mockRejectedValueOnce(new Error("pending list failed"))
      .mockResolvedValueOnce({ results: [], total: 0, next_cursor: null });
    const failedRequests = {
      listPendingSentenceAssociations: failedList,
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "target-publication",
            entry_id: word.id,
            is_current: true,
            schema_version: 3
          }
        ]
      })
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={failedRequests}
          word={word}
        />
      </AntApp>
    );
    expect(await screen.findByText("pending list failed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /重试/u }));
    expect(
      await screen.findByText("当前词条没有待认领的多维例句")
    ).toBeVisible();
    expect(failedList).toHaveBeenCalledTimes(2);
  });

  it("没有 current publication 或匹配词形时阻断认领并给出明确提示", async () => {
    const noPublicationRequests = {
      listPendingSentenceAssociations: vi.fn().mockResolvedValue({
        results: [],
        total: 0,
        next_cursor: null
      }),
      listPublications: vi.fn().mockResolvedValue({ publications: [] })
    } as unknown as V3WordRequests;
    const first = render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={noPublicationRequests}
          word={word}
        />
      </AntApp>
    );
    expect(
      await screen.findByText("当前词条缺少可认领的发布版本，请刷新后重试")
    ).toBeVisible();
    first.unmount();

    const noVariantWord = structuredClone(word);
    const noVariantRegional =
      noVariantWord.forms.pos[0]!.forms[0]!.regional_variants;
    if (noVariantRegional.mode !== "common") {
      throw new Error("expected common fixture");
    }
    noVariantRegional.common.spelling = "different";
    const requests = {
      listPendingSentenceAssociations: vi.fn().mockResolvedValue({
        results: [
          {
            association_id: "association-no-variant",
            owner_entry_id: "owner-entry",
            owner_entry_revision: 4,
            owner_lifecycle_revision: 2,
            sentence_id: "sentence-no-variant",
            source_dialect: "common",
            source_segments: [{ start: 0, end: 6, surface: "center" }],
            sentence_text: "Center appears here.",
            pending_target_kind: "phrase",
            pending_target_headword: "center"
          }
        ],
        total: 1,
        next_cursor: null
      }),
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "target-publication",
            entry_id: noVariantWord.id,
            is_current: true,
            schema_version: 3
          }
        ]
      })
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={noVariantWord}
        />
      </AntApp>
    );
    await screen.findByText("Center appears here.");
    expect(screen.getByText("当前发布版本没有匹配词形")).toBeVisible();
    expect(screen.getByRole("button", { name: "正式认领" })).toBeDisabled();
  });

  it("词义选择兼容无定义、统一英文与英美回退文本", async () => {
    const targetWord = structuredClone(word);
    targetWord.meanings.pos[0]!.senses = [
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-no-definition",
        sub_pos: "无定义词义",
        definitions: []
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-unified",
        sub_pos: "统一英文",
        definitions: [
          {
            id: "definition-unified",
            level: "B1",
            definition_mode: "en_definition",
            content: {
              mode: "unified",
              common: {
                id: "definition-unified-text",
                origin: "manual",
                value: { version: 2, text: "central place", annotations: [] }
              }
            }
          }
        ]
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-preferred",
        sub_pos: "英式优先",
        definitions: [
          {
            id: "definition-preferred",
            level: "B1",
            definition_mode: "en_definition",
            content: {
              mode: "distinguish",
              source_dialect: "uk",
              uk: {
                state: "ready",
                variant: {
                  id: "definition-uk",
                  origin: "manual",
                  value: { version: 2, text: "centre place", annotations: [] }
                }
              },
              us: { state: "missing" }
            }
          }
        ]
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-fallback",
        sub_pos: "美式回退",
        definitions: [
          {
            id: "definition-fallback",
            level: "B1",
            definition_mode: "en_definition",
            content: {
              mode: "distinguish",
              source_dialect: "uk",
              uk: { state: "missing" },
              us: {
                state: "ready",
                variant: {
                  id: "definition-us",
                  origin: "manual",
                  value: { version: 2, text: "center place", annotations: [] }
                }
              }
            }
          }
        ]
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-empty-unified",
        sub_pos: "",
        definitions: [
          {
            id: "definition-empty-unified",
            level: "B1",
            definition_mode: "en_definition",
            content: {
              mode: "unified",
              common: {
                id: "definition-empty-text",
                origin: "manual",
                value: { version: 2, text: "", annotations: [] }
              }
            }
          }
        ]
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-us-source",
        sub_pos: "美式来源",
        definitions: [
          {
            id: "definition-us-source",
            level: "B1",
            definition_mode: "en_definition",
            content: {
              mode: "distinguish",
              source_dialect: "us",
              uk: {
                state: "ready",
                variant: {
                  id: "definition-uk-fallback",
                  origin: "manual",
                  value: { version: 2, text: "UK fallback", annotations: [] }
                }
              },
              us: { state: "missing" }
            }
          }
        ]
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-empty-zh-sub-pos",
        sub_pos: "中文释义回退",
        definitions: [
          {
            id: "definition-empty-zh-sub-pos",
            level: "B1",
            definition_mode: "zh_definition",
            content_id: "definition-empty-zh-sub-pos-content",
            content: { version: 2, text: "", annotations: [] }
          }
        ]
      },
      {
        ...targetWord.meanings.pos[0]!.senses[0]!,
        id: "sense-empty-zh",
        sub_pos: "",
        definitions: [
          {
            id: "definition-empty-zh",
            level: "B1",
            definition_mode: "zh_definition",
            content_id: "definition-empty-zh-content",
            content: { version: 2, text: "", annotations: [] }
          }
        ]
      }
    ];
    const requests = {
      listPendingSentenceAssociations: vi.fn().mockResolvedValue({
        results: [
          {
            association_id: "association-sense-labels",
            owner_entry_id: "owner-entry",
            owner_entry_revision: 4,
            owner_lifecycle_revision: 2,
            sentence_id: "sentence-sense-labels",
            source_dialect: "common",
            source_segments: [
              { start: 0, end: 18, surface: "center of the wall" }
            ],
            sentence_text: "The center of the wall.",
            pending_target_kind: "phrase",
            pending_target_headword: "center of the wall"
          }
        ],
        total: 1,
        next_cursor: null
      }),
      listPublications: vi.fn().mockResolvedValue({
        publications: [
          {
            publication_id: "target-publication",
            entry_id: targetWord.id,
            is_current: true,
            schema_version: 3
          }
        ]
      })
    } as unknown as V3WordRequests;
    render(
      <AntApp>
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={targetWord}
        />
      </AntApp>
    );
    await screen.findByText("The center of the wall.");
    fireEvent.mouseDown(
      screen.getByLabelText(
        "为待认领例句 association-sense-labels 选择具体词义"
      )
    );
    expect(screen.getByText(/释义 1 · 无定义词义/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 2 · central place/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 3 · centre place/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 4 · center place/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 5 · 未填写释义/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 6 · UK fallback/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 7 · 中文释义回退/u)).toBeInTheDocument();
    expect(screen.getByText(/释义 8 · 未填写释义/u)).toBeInTheDocument();
  });
});
