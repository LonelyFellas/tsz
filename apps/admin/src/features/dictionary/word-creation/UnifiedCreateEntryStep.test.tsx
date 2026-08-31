import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { HttpError } from "@tsz/api-client/http";
import type {
  AdminWordV3,
  DetectLexiconSurfaceResponseV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "./wordCreation.test.helper";

const dialectPreference = vi.hoisted(() => ({
  value: "us" as "uk" | "us"
}));

vi.mock("../../settings/useDialectPreference", () => ({
  useDialectPreference: () => ({
    preference: dialectPreference.value,
    savePreference: vi.fn()
  })
}));

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogFixture } =
    await import("./partOfSpeech.test.helper");
  return {
    usePartOfSpeechCatalog: () => ({
      data: partOfSpeechCatalogFixture,
      isError: false,
      isPending: false
    })
  };
});

import {
  UnifiedCreateEntryStep,
  type UnifiedCreateRequests
} from "./UnifiedCreateEntryStep";

function v3Word(): AdminWordV3 {
  return {
    schema_version: 3,
    id: "word-v3",
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: "center",
      matched_surfaces: ["center"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: { pos: [] },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: [],
    max_reachable_step: "basics",
    created_by: "admin",
    created_at: "2026-08-26T00:00:00Z",
    updated_at: "2026-08-26T00:00:00Z"
  };
}

function v3PhraseWord(surface = "give up"): AdminWordV3 {
  return {
    ...v3Word(),
    id: "phrase-v3",
    kind: "phrase",
    presentation: {
      label: surface,
      matched_surfaces: [surface],
      strategy_version: "surface_summary_v1"
    }
  };
}

function v3PrefilledWord(): AdminWordV3 {
  const word = v3Word();
  word.forms.pos = [
    {
      pos_id: "prefilled-pos",
      pos: "noun",
      dialect_rules: {
        spelling_mode: "unified",
        phonetic_mode: "unified"
      },
      forms: [
        {
          id: "prefilled-form",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: "prefilled-variant",
              dialect: "common",
              spelling: "center",
              origin: "dictionary",
              pronunciations: []
            }
          }
        }
      ],
      form_groups: [
        {
          id: "prefilled-group",
          is_regular: true,
          members: [{ id: "prefilled-membership", form_id: "prefilled-form" }]
        }
      ]
    }
  ];
  return word;
}

function v3Detection(
  surface = "center",
  overrides: Partial<DetectLexiconSurfaceResponseV3> = {}
): DetectLexiconSurfaceResponseV3 {
  return {
    schema_version: 3,
    detection_id: "detection-v3",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    request: { language: "en", kind: "word", surface },
    normalized_surface: surface,
    builtin_dictionary: { status: "not_found" },
    suggested_pos: [],
    matches: [],
    requires_acknowledgement: false,
    ...overrides
  };
}

function v3PhraseDetection(
  surface = "give up",
  overrides: Partial<DetectLexiconSurfaceResponseV3> = {}
): DetectLexiconSurfaceResponseV3 {
  return v3Detection(surface, {
    request: { language: "en", kind: "phrase", surface },
    ...overrides
  });
}

function terminalV3Page(): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "snapshot-v3",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 1,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: "surface-token"
  };
}

function v3BaseFormPage(): SurfaceMatchPageV3 {
  return {
    ...terminalV3Page(),
    total: 2,
    items: [
      {
        match_kind: "form_variant_v3",
        match: {
          source_schema_version: 3,
          entry_id: "existing-v3",
          entry_kind: "word",
          status: "published",
          content_scope: "current_publication",
          pos_id: "existing-pos",
          group_ids: [],
          form_id: "existing-base",
          variant_id: "existing-uk",
          form_type: "base",
          dialect: "uk",
          spelling: "centre"
        }
      },
      {
        match_kind: "form_variant_v3",
        match: {
          source_schema_version: 3,
          entry_id: "existing-v3",
          entry_kind: "word",
          status: "published",
          content_scope: "current_publication",
          pos_id: "existing-pos",
          group_ids: [],
          form_id: "existing-base",
          variant_id: "existing-us",
          form_type: "base",
          dialect: "us",
          spelling: "center"
        }
      }
    ],
    matched_entry_contexts: [
      {
        entry_id: "existing-v3",
        presentation: {
          label: "centre / center",
          matched_surfaces: ["centre", "center"],
          strategy_version: "surface_summary_v1"
        },
        pos_labels: ["noun"],
        gloss_previews: ["中心"],
        updated_at: "2026-08-26T00:00:00Z",
        inbound_relations: {
          total: 0,
          by_type: { synonym: 0, antonym: 0, derivative: 0 },
          previews: [],
          truncated: false
        }
      }
    ]
  };
}

function existingV3Word(): AdminWordV3 {
  const word = v3Word();
  word.id = "existing-v3";
  word.status = "published";
  word.presentation.label = "centre / center";
  word.forms.pos = [
    {
      pos_id: "existing-pos",
      pos: "noun",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      },
      forms: [
        {
          id: "existing-base",
          form_type: "base",
          regional_variants: {
            mode: "uk_us",
            uk: {
              id: "existing-uk",
              dialect: "uk",
              spelling: "centre",
              origin: "dictionary",
              pronunciations: []
            },
            us: {
              id: "existing-us",
              dialect: "us",
              spelling: "center",
              origin: "dictionary",
              pronunciations: []
            }
          }
        }
      ],
      form_groups: []
    }
  ];
  return word;
}

function v3SurfacePage(
  mode: "terminal" | "disabled" | "loading"
): SurfaceMatchPageV3 {
  const base = {
    schema_version: 3 as const,
    snapshot_id: `snapshot-v3-${mode}`,
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "surface_warning_acknowledgement" as const,
    policy_epoch: 1
  };
  if (mode === "disabled") {
    return {
      ...base,
      continuation_policy: "temporarily_disabled",
      next_cursor: null,
      policy_block_code: "exact_headword_creation_temporarily_disabled"
    };
  }
  if (mode === "loading") {
    return {
      ...base,
      continuation_policy: "enabled",
      next_cursor: "next-page"
    };
  }
  return {
    ...base,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: "surface-token-v3"
  };
}

function matchedV3Detection(
  surface = "center"
): DetectLexiconSurfaceResponseV3 {
  return v3Detection(surface, {
    suggested_pos: ["noun", "verb"],
    builtin_dictionary: {
      status: "matched",
      provider: { name: "fixture-dictionary", version: "1" },
      suggested_pos: ["noun", "verb"],
      suggested_forms: [
        {
          pos: "noun",
          form_type: "base",
          regional_variants: {
            mode: "uk_us",
            uk: {
              dialect: "uk",
              spelling: "centre",
              pronunciations: [
                {
                  dict_phonetic: "ˈsentə",
                  actual_pron: "ˈsentə",
                  style: "normal"
                }
              ]
            },
            us: {
              dialect: "us",
              spelling: "center",
              pronunciations: [
                {
                  dict_phonetic: "ˈsentər",
                  actual_pron: "ˈsen(t)ər",
                  style: "weak"
                }
              ]
            }
          }
        },
        {
          pos: "noun",
          form_type: "plural",
          regional_variants: {
            mode: "common",
            common: {
              dialect: "common",
              spelling: "centers",
              pronunciations: [{ dict_phonetic: "ˈsentərz" }]
            }
          }
        },
        {
          pos: "verb",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              dialect: "common",
              spelling: "center",
              pronunciations: [{ dict_phonetic: "ˈsentər" }]
            }
          }
        }
      ],
      coverage: {
        forms: "complete",
        pronunciations: "complete",
        meanings: "partial",
        examples: "missing",
        frequency: "partial"
      },
      provenance: {
        forms: { name: "fixture-dictionary", version: "1" },
        pronunciations: { name: "fixture-dictionary", version: "1" }
      }
    }
  });
}

function requests(): UnifiedCreateRequests {
  return {
    detectV3: vi.fn(),
    createV3: vi.fn(),
    getWord: vi.fn(),
    surfacePage: vi.fn()
  };
}

function renderStep(supplied: UnifiedCreateRequests, onCreated = vi.fn()) {
  render(
    <AntApp>
      <UnifiedCreateEntryStep requests={supplied} onCreated={onCreated} />
    </AntApp>
  );
  return onCreated;
}

function input() {
  return screen.getByPlaceholderText("例如 center 或 give up");
}

beforeEach(() => {
  vi.clearAllMocks();
  dialectPreference.value = "us";
});

describe("UnifiedCreateEntryStep", () => {
  it("美式偏好锁定美式侧并把编辑后的英式最终值提交给 V3 create", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(matchedV3Detection());
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3PrefilledWord() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    const uk = await screen.findByLabelText("英式主词");
    const us = screen.getByLabelText("美式主词");
    expect(uk).toBeEnabled();
    expect(us).toBeDisabled();
    expect(screen.getByText(/按个人偏好锁定美式主词/)).toBeVisible();

    fireEvent.change(uk, { target: { value: "centre-edited" } });
    fireEvent.click(screen.getByText("创建并进入词形与发音"));

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headwords: {
          mode: "distinguish",
          uk: "centre-edited",
          us: "center",
          source_dialect: "us"
        }
      })
    );
  });

  it("英式偏好锁定英式侧，模式往返保留确认值并提交英式 source_dialect", async () => {
    dialectPreference.value = "uk";
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(matchedV3Detection());
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3PrefilledWord() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByLabelText("英式主词")).toBeDisabled();
    expect(screen.getByLabelText("美式主词")).toBeEnabled();
    fireEvent.click(screen.getByLabelText("区分英美词形"));
    const common = screen.getByLabelText("统一主词");
    expect(common).toHaveValue("centre");
    fireEvent.change(common, { target: { value: "central" } });
    fireEvent.click(screen.getByLabelText("区分英美词形"));
    expect(screen.getByLabelText("英式主词")).toHaveValue("central");
    expect(screen.getByLabelText("美式主词")).toHaveValue("central");
    fireEvent.change(screen.getByLabelText("美式主词"), {
      target: { value: "center-final" }
    });
    fireEvent.click(screen.getByText("创建并进入词形与发音"));

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headwords: {
          mode: "distinguish",
          uk: "central",
          us: "center-final",
          source_dialect: "uk"
        }
      })
    );
  });

  it("词典未命中时统一主词仍可编辑并作为最终创建值", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("novel-term"));
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "novel-term" } });
    fireEvent.click(screen.getByText("词典检测"));
    const common = await screen.findByLabelText("统一主词");
    fireEvent.change(common, { target: { value: "novel-final" } });
    fireEvent.click(screen.getByText("创建并进入词形与发音"));

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headwords: { mode: "unified", common: "novel-final" }
      })
    );
  });

  it("编辑后的最终主词非法时不发送创建请求", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("novel-term"));
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "novel-term" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.change(await screen.findByLabelText("统一主词"), {
      target: { value: "苹果" }
    });
    fireEvent.click(screen.getByText("创建并进入词形与发音"));

    expect(supplied.createV3).not.toHaveBeenCalled();
    expect(screen.getByText("请先填写合法的英文主词后再创建。")).toBeVisible();
  });

  it("Pending 创建入口预填目标词头并把完整导航状态交还创建页", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(
      v3PhraseDetection("center of the wall")
    );
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    const onCreated = vi.fn();
    const initialPendingTarget = {
      associationId: "association-1",
      headword: "center of the wall",
      gloss: "墙的中心位置",
      returnTo: "/words/source/v3/wizard/meanings?mode=edit"
    };
    render(
      <AntApp>
        <UnifiedCreateEntryStep
          initialPendingTarget={initialPendingTarget}
          onCreated={onCreated}
          requests={supplied}
        />
      </AntApp>
    );

    expect(input()).toHaveValue("center of the wall");
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(v3Word(), {
      creationSource: "blank",
      pendingSentenceTarget: initialPendingTarget
    });
  });

  it("统一入口复用旧版第一步结构和中文文案", () => {
    renderStep(requests());

    expect(screen.getByText("STEP 01")).toBeVisible();
    expect(screen.getByText("创建新词条")).toBeVisible();
    expect(screen.getByText("录入与检测")).toBeVisible();
    expect(screen.getByText("录入词条")).toBeVisible();
    expect(screen.getByRole("button", { name: /词典检测/ })).toBeVisible();
    expect(screen.queryByText("输入要创建的英文词条")).toBeNull();
    expect(screen.queryByText("词条信息")).toBeNull();
  });

  it("单词先检测且不创建，明确进入 Step 2 后才返回 V3 canonical word", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("can't"));
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "  can't  " } });
    fireEvent.click(screen.getByText("词典检测"));

    await waitFor(() => expect(supplied.detectV3).toHaveBeenCalledTimes(1));
    expect(supplied.detectV3).toHaveBeenCalledWith({
      schema_version: 3,
      language: "en",
      kind: "word",
      surface: "can't"
    });
    expect(supplied.createV3).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("创建并进入词形与发音"));

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(v3Word(), {
      creationSource: "blank"
    });
    expect(screen.queryByText(/检测 V3|创建 V3|schema|revision/)).toBeNull();
  });

  it("#131 matched 但创建响应 forms 为空时不谎报词典预填", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(matchedV3Detection());
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(v3Word(), {
      creationSource: "dictionary-empty"
    });
  });

  it.each([
    ["实际预填", v3PrefilledWord(), "dictionary"],
    ["异常空 forms", v3Word(), "dictionary-empty"]
  ])(
    "#132 重复确认后按创建响应区分 $0",
    async (_scenario, createdWord, expectedSource) => {
      const supplied = requests();
      vi.mocked(supplied.detectV3).mockResolvedValue({
        ...matchedV3Detection(),
        requires_acknowledgement: true,
        surface_match_page: terminalV3Page()
      });
      vi.mocked(supplied.createV3).mockResolvedValue({ word: createdWord });
      const onCreated = renderStep(supplied);

      fireEvent.change(input(), { target: { value: "center" } });
      fireEvent.click(screen.getByText("词典检测"));
      fireEvent.click(await screen.findByText("确认并创建，进入词形与发音"));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(onCreated).toHaveBeenCalledWith(createdWord, {
        creationSource: expectedSource
      });
    }
  );

  it("输入框按 Enter 只触发检测并停留在 Step 1", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("center"));
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    const onCreated = renderStep(supplied);

    expect(
      screen.getByText("STEP 01").closest(".word-basics-workflow")
    ).not.toHaveClass("is-detected");

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.keyDown(input(), { key: "Enter", code: "Enter" });

    await waitFor(() => expect(supplied.detectV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "创建并进入词形与发音" })
    ).toBeVisible();
    expect(
      screen.getByText("STEP 01").closest(".word-basics-workflow")
    ).toHaveClass("is-detected");
  });

  it("检测请求进行中重复提交只发送一次", async () => {
    const supplied = requests();
    const detection = deferred<DetectLexiconSurfaceResponseV3>();
    vi.mocked(supplied.detectV3).mockReturnValue(detection.promise);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(screen.getByText("词典检测"));

    expect(supplied.detectV3).toHaveBeenCalledTimes(1);
    expect(supplied.createV3).not.toHaveBeenCalled();
    await act(async () => detection.resolve(v3Detection("center")));
  });

  it("短语折叠空白后通过 V3 检测与创建进入同一套 Step 2", async () => {
    const supplied = requests();
    const detection = v3PhraseDetection("give up");
    const phraseWord = v3PhraseWord("give up");
    vi.mocked(supplied.detectV3).mockResolvedValue(detection);
    vi.mocked(supplied.createV3).mockResolvedValue({ word: phraseWord });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: " give\t\nup " } });
    fireEvent.click(screen.getByText("词典检测"));

    await waitFor(() => expect(supplied.detectV3).toHaveBeenCalledTimes(1));
    expect(supplied.detectV3).toHaveBeenCalledWith({
      schema_version: 3,
      language: "en",
      kind: "phrase",
      surface: "give up"
    });
    expect(supplied.createV3).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "创建并进入词形与发音" })
    );

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(expect.any(String), {
      schema_version: 3,
      detection_id: detection.detection_id,
      kind: "phrase",
      headwords: { mode: "unified", common: "give up" }
    });
    expect(onCreated).toHaveBeenCalledWith(phraseWord, {
      creationSource: "blank"
    });
  });

  it("V3 matched 无数据库原形时沿用内置词典英美式并按输入判定来源方言", async () => {
    const supplied = requests();
    const creation = deferred<{ word: AdminWordV3 }>();
    const detection = matchedV3Detection("centre");
    vi.mocked(supplied.detectV3).mockResolvedValue(detection);
    vi.mocked(supplied.createV3).mockReturnValue(creation.promise);
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "centre" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByText("确认英美主词")).toBeVisible();
    expect(screen.getByLabelText("英式主词")).toHaveValue("centre");
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("动词").length).toBeGreaterThan(0);
    expect(document.querySelector(".word-headword-source")).toHaveTextContent(
      "来源：内置词典"
    );
    expect(screen.queryByText("复数")).toBeNull();
    expect(screen.queryByText("词典音标：ˈsentə")).toBeNull();
    expect(screen.queryByText(/实际发音/)).toBeNull();
    expect(screen.queryByText("弱读")).toBeNull();
    expect(screen.queryByText("matched")).toBeNull();
    expect(screen.queryByText("fixture-dictionary")).toBeNull();
    expect(supplied.createV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("创建并进入词形与发音"));
    expect(supplied.createV3).toHaveBeenCalledWith(expect.any(String), {
      schema_version: 3,
      detection_id: detection.detection_id,
      kind: "word",
      headwords: {
        mode: "distinguish",
        uk: "centre",
        us: "center",
        source_dialect: "uk"
      }
    });
    const prefilled = v3PrefilledWord();
    await act(async () => creation.resolve({ word: prefilled }));
    expect(onCreated).toHaveBeenCalledWith(prefilled, {
      creationSource: "dictionary"
    });
  });

  it.each([
    ["missing", "发音：词典未提供"],
    ["partial", "发音：部分覆盖"]
  ] as const)(
    "V3 matched 将 partial/%s coverage 显示为中文产品提示",
    async (pronunciations, expectedPronunciation) => {
      const supplied = requests();
      const detection = matchedV3Detection("child");
      if (detection.builtin_dictionary.status !== "matched") {
        throw new Error("expected matched dictionary fixture");
      }
      detection.builtin_dictionary.coverage.forms = "partial";
      detection.builtin_dictionary.coverage.pronunciations = pronunciations;
      vi.mocked(supplied.detectV3).mockResolvedValue(detection);
      renderStep(supplied);

      fireEvent.change(input(), { target: { value: "child" } });
      fireEvent.click(screen.getByText("词典检测"));

      expect(await screen.findByText("词形：部分覆盖")).toBeVisible();
      expect(screen.getByText(expectedPronunciation)).toBeVisible();
      expect(screen.queryByText(/^partial$|^missing$/u)).toBeNull();
      expect(screen.queryByText(/detection-v3|fixture-dictionary/u)).toBeNull();
    }
  );

  it("内置词典提供英美式时优先于已有原形填充右侧主词", async () => {
    const supplied = requests();
    const detection = matchedV3Detection();
    vi.mocked(supplied.detectV3).mockResolvedValue({
      ...detection,
      requires_acknowledgement: true,
      surface_match_page: v3BaseFormPage()
    });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByText("确认英美主词")).toBeVisible();
    expect(await screen.findByText("区分英美词形")).toBeVisible();
    expect(screen.getByText("英式英语 · BrE")).toBeVisible();
    expect(screen.getByText("美式英语 · AmE")).toBeVisible();
    expect(screen.getByLabelText("英式主词")).toHaveValue("centre");
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
    expect(screen.getByText("centre / center")).toBeVisible();
    expect(screen.getByText("已发布")).toBeVisible();
    expect(screen.getByText("来源：内置词典")).toBeVisible();
    expect(supplied.getWord).not.toHaveBeenCalled();
    expect(screen.queryByText("确认英美主词与词形")).toBeNull();
    expect(screen.queryByText("已找到内置词典建议")).toBeNull();
    expect(screen.queryByText("词典音标：ˈsentə")).toBeNull();
  });

  it("命中已有原形时二次确认后才创建新的独立词条", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue({
      ...matchedV3Detection(),
      requires_acknowledgement: true,
      surface_match_page: v3BaseFormPage()
    });
    vi.mocked(supplied.getWord).mockResolvedValue({ word: existingV3Word() });
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    await screen.findByLabelText("英式主词");

    fireEvent.click(
      screen.getByRole("button", {
        name: "确认并创建，进入词形与发音"
      })
    );
    expect(supplied.createV3).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getAllByText("确认创建新的独立词条？").length
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getByText(
        "检测到智能词库已有相同原形。继续后将创建一个新的独立词条，不会修改已有词条。"
      )
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "继续创建" }));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
  });

  it("命中草稿原形时提供四字继续创建入口并路由到对应 schema", async () => {
    const supplied = requests();
    const page = v3BaseFormPage();
    for (const item of page.items) {
      if (item.match_kind === "form_variant_v3") {
        item.match.status = "draft";
        item.match.content_scope = "draft";
      }
    }
    vi.mocked(supplied.detectV3).mockResolvedValue({
      ...matchedV3Detection(),
      requires_acknowledgement: true,
      surface_match_page: page
    });
    const draft = existingV3Word();
    draft.status = "draft";
    vi.mocked(supplied.getWord).mockResolvedValue({ word: draft });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    const link = await screen.findByRole("link", { name: "继续创建" });
    expect(link).toHaveAttribute("href", "/words/existing-v3/v3/wizard/forms");
    expect(link).toHaveTextContent("继续创建");
  });

  it("首个数据库原形详情加载失败时阻断创建，重试成功后才允许继续", async () => {
    const supplied = requests();
    const detection = matchedV3Detection();
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("expected matched dictionary fixture");
    }
    detection.builtin_dictionary.suggested_forms[0]!.regional_variants = {
      mode: "common",
      common: {
        dialect: "common",
        spelling: "center",
        pronunciations: []
      }
    };
    vi.mocked(supplied.detectV3).mockResolvedValue({
      ...detection,
      requires_acknowledgement: true,
      surface_match_page: v3BaseFormPage()
    });
    vi.mocked(supplied.getWord)
      .mockRejectedValueOnce(new Error("detail unavailable"))
      .mockResolvedValueOnce({ word: existingV3Word() });
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByText("原形详情加载失败")).toBeVisible();
    const create = screen.getByRole("button", {
      name: "确认并创建，进入词形与发音"
    });
    expect(create.querySelector('[data-icon="plus"]')).not.toBeNull();
    expect(create).toBeDisabled();
    expect(supplied.createV3).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(supplied.getWord).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("英式主词")).toHaveValue("centre");
    expect(create).toBeEnabled();
  });

  it("V3 matched 即使建议词性没有对应词形也会独立展示", async () => {
    const supplied = requests();
    const detection = matchedV3Detection();
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("expected matched dictionary fixture");
    }
    detection.builtin_dictionary.suggested_forms =
      detection.builtin_dictionary.suggested_forms.filter(
        (form) => form.pos === "noun"
      );
    vi.mocked(supplied.detectV3).mockResolvedValue(detection);
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByText("确认英美主词")).toBeVisible();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("动词").length).toBeGreaterThan(0);
  });

  it("#133 只展示顶层权威合并 suggested_pos 并去重", async () => {
    const supplied = requests();
    const detection = matchedV3Detection();
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("expected matched dictionary fixture");
    }
    Object.assign(detection, {
      suggested_pos: ["noun", "verb", "adjective", "noun"]
    });
    vi.mocked(supplied.detectV3).mockResolvedValue(detection);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    const card = (await screen.findByText("词典检测结果")).closest(
      ".word-detection-result-card"
    );
    if (!(card instanceof HTMLElement)) throw new Error("detection card");
    expect(within(card).getByText("来源：内置词典")).toBeVisible();
    expect(within(card).queryByText("来源：智能词库")).toBeNull();
    expect(within(card).queryByText("形容词")).toBeNull();
    expect(within(card).getByText("名词")).toBeVisible();
    expect(within(card).getByText("动词")).toBeVisible();
    expect(within(card).queryByText("· 内置词典")).toBeNull();
    expect(within(card).queryByText("· 已有词条")).toBeNull();
  });

  it("V3 matched phrase 与单词共用英美主词展示和创建载荷", async () => {
    const supplied = requests();
    const detection = matchedV3Detection("in front of");
    detection.request.kind = "phrase";
    const phraseWord = v3PhraseWord("in front of");
    const creation = deferred<{ word: AdminWordV3 }>();
    vi.mocked(supplied.detectV3).mockResolvedValue(detection);
    vi.mocked(supplied.createV3).mockReturnValue(creation.promise);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "in front of" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByText("确认英美主词")).toBeVisible();
    expect(screen.getByLabelText("英式主词")).toHaveValue("centre");
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.queryByText("现在分词")).toBeNull();
    expect(screen.queryByText(/词典音标/)).toBeNull();
    expect(document.querySelector(".word-headword-source")).toHaveTextContent(
      "来源：内置词典"
    );
    expect(screen.getByLabelText("区分英美词形")).toBeEnabled();
    expect(supplied.createV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("创建并进入词形与发音"));
    expect(supplied.createV3).toHaveBeenCalledWith(expect.any(String), {
      schema_version: 3,
      detection_id: detection.detection_id,
      kind: "phrase",
      headwords: {
        mode: "distinguish",
        uk: "centre",
        us: "center",
        source_dialect: "us"
      }
    });

    await act(async () => creation.resolve({ word: phraseWord }));
  });

  it("V3 phrase not_found 使用本次输入填充统一主词", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(
      v3PhraseDetection("in common")
    );
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "in common" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByLabelText("统一主词")).toHaveValue("in common");
    expect(screen.getByText("短语词条")).toBeVisible();
    expect(screen.getByText("来源：本次输入")).toBeVisible();
  });

  it("not_found 使用本次输入填充统一主词并等待确认，unavailable 则阻断", async () => {
    const notFoundRequests = requests();
    const creation = deferred<{ word: AdminWordV3 }>();
    vi.mocked(notFoundRequests.detectV3).mockResolvedValue(
      v3Detection("invented")
    );
    vi.mocked(notFoundRequests.createV3).mockReturnValue(creation.promise);
    const { unmount } = render(
      <AntApp>
        <UnifiedCreateEntryStep
          requests={notFoundRequests}
          onCreated={vi.fn()}
        />
      </AntApp>
    );

    fireEvent.change(input(), { target: { value: "invented" } });
    fireEvent.click(screen.getByText("词典检测"));
    expect(await screen.findByText("确认英美主词")).toBeVisible();
    expect(screen.getByLabelText("统一主词")).toHaveValue("invented");
    expect(screen.getByText("来源：本次输入")).toBeVisible();
    expect(notFoundRequests.createV3).not.toHaveBeenCalled();
    unmount();

    const unavailableRequests = requests();
    vi.mocked(unavailableRequests.detectV3).mockResolvedValue(
      v3Detection("unavailable", {
        builtin_dictionary: { status: "unavailable", retry_after_seconds: 3 }
      })
    );
    renderStep(unavailableRequests);
    fireEvent.change(input(), { target: { value: "unavailable" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(
      await screen.findByText("内置词典暂时不可用，请稍后重试。")
    ).toBeVisible();
    expect(unavailableRequests.createV3).not.toHaveBeenCalled();
    expect(screen.queryByText("not_found")).toBeNull();
  });

  it("V3 确认要求只展示产品信息，确认后携终页 token 创建", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(
      v3Detection("center", {
        requires_acknowledgement: true,
        surface_match_page: terminalV3Page()
      })
    );
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    await screen.findByText("确认并创建，进入词形与发音");
    expect(screen.getByRole("button", { name: "重新检测" })).toBeVisible();
    expect(screen.queryByText("发现可能重复的词条")).toBeNull();
    expect(screen.queryByText(/继续创建只会新增草稿/)).not.toBeInTheDocument();
    expect(screen.queryByText("snapshot-v3")).toBeNull();
    expect(screen.queryByText("surface-token")).toBeNull();
    fireEvent.click(screen.getByText("确认并创建，进入词形与发音"));

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        confirmed_surface_match_token: "surface-token"
      })
    );
  });

  it("创建结果未知时保留同一幂等键供原样重试", async () => {
    const supplied = requests();
    const firstDetection = v3Detection();
    const detectedAt = Date.now();
    firstDetection.expires_at = new Date(detectedAt + 60_000).toISOString();
    const changedDetection = v3Detection();
    changedDetection.detection_id = "changed-detection-v3";
    vi.mocked(supplied.detectV3)
      .mockResolvedValueOnce(firstDetection)
      .mockResolvedValueOnce(changedDetection);
    vi.mocked(supplied.createV3)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ word: v3Word() });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));
    expect(
      await screen.findByText("网络异常，创建结果未知。请原样重试。")
    ).toBeVisible();

    const frozenHeadword = screen.getByLabelText("统一主词");
    expect(frozenHeadword).toBeDisabled();
    expect(screen.getByRole("switch", { name: "区分英美词形" })).toBeDisabled();
    expect(input()).toBeDisabled();

    const now = vi.spyOn(Date, "now").mockReturnValue(detectedAt + 120_000);
    fireEvent.click(screen.getByText("原样重试创建"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(2));
    now.mockRestore();

    expect(supplied.detectV3).toHaveBeenCalledTimes(1);
    expect(vi.mocked(supplied.createV3).mock.calls[1]?.[0]).toBe(
      vi.mocked(supplied.createV3).mock.calls[0]?.[0]
    );
    expect(vi.mocked(supplied.createV3).mock.calls[1]?.[1]).toEqual(
      vi.mocked(supplied.createV3).mock.calls[0]?.[1]
    );
    expect(onCreated).toHaveBeenCalledWith(v3Word(), {
      creationSource: "blank"
    });
  });

  it("响应解析异常也冻结完整创建载荷并只允许同键原样重试", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection());
    vi.mocked(supplied.createV3)
      .mockRejectedValueOnce(new SyntaxError("invalid response payload"))
      .mockResolvedValueOnce({ word: v3Word() });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));

    expect(
      await screen.findByText("响应异常，创建结果未知。请原样重试。")
    ).toBeVisible();
    expect(screen.getByLabelText("统一主词")).toBeDisabled();
    fireEvent.click(screen.getByText("原样重试创建"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(2));
    expect(vi.mocked(supplied.createV3).mock.calls[1]).toEqual(
      vi.mocked(supplied.createV3).mock.calls[0]
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("V3 phrase 警告确认携带 token，禁用与分页失败状态保持阻断", async () => {
    const terminalRequests = requests();
    const terminalDetection = v3PhraseDetection("give up", {
      requires_acknowledgement: true,
      surface_match_page: v3SurfacePage("terminal")
    });
    vi.mocked(terminalRequests.detectV3).mockResolvedValue(terminalDetection);
    vi.mocked(terminalRequests.createV3).mockResolvedValue({
      word: v3PhraseWord()
    });
    const terminalView = render(
      <AntApp>
        <UnifiedCreateEntryStep
          requests={terminalRequests}
          onCreated={vi.fn()}
        />
      </AntApp>
    );
    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("确认并创建，进入词形与发音"));
    await waitFor(() => expect(terminalRequests.createV3).toHaveBeenCalled());
    expect(terminalRequests.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        kind: "phrase",
        confirmed_surface_match_token: "surface-token-v3"
      })
    );
    terminalView.unmount();

    const disabledRequests = requests();
    const disabledDetection = v3PhraseDetection("give up", {
      requires_acknowledgement: true,
      surface_match_page: v3SurfacePage("disabled")
    });
    vi.mocked(disabledRequests.detectV3).mockResolvedValue(disabledDetection);
    const disabledView = render(
      <AntApp>
        <UnifiedCreateEntryStep
          requests={disabledRequests}
          onCreated={vi.fn()}
        />
      </AntApp>
    );
    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("词典检测"));
    expect(
      await screen.findByText("当前策略暂不允许继续创建该词条。")
    ).toBeVisible();
    expect(screen.getByText("原形检测")).toBeVisible();
    expect(screen.queryByText("重复检测")).toBeNull();
    expect(screen.queryByText("原形详情加载失败")).toBeNull();
    expect(screen.queryByRole("button", { name: "重新加载" })).toBeNull();
    expect(disabledRequests.getWord).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "确认并创建，进入词形与发音"
      })
    ).toBeDisabled();
    disabledView.unmount();

    const failedRequests = requests();
    const failedDetection = v3PhraseDetection("give up", {
      requires_acknowledgement: true,
      surface_match_page: v3SurfacePage("loading")
    });
    vi.mocked(failedRequests.detectV3).mockResolvedValue(failedDetection);
    vi.mocked(failedRequests.surfacePage).mockRejectedValue(
      new Error("page failed")
    );
    renderStep(failedRequests);
    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("词典检测"));
    expect(
      await screen.findByText("匹配结果已失效，请返回修改后重新提交。")
    ).toBeVisible();
    expect(failedRequests.createV3).not.toHaveBeenCalled();
  });

  it("创建时匹配结果变化会轮换幂等键并要求重新确认", async () => {
    const supplied = requests();
    const replacementPage = {
      ...terminalV3Page(),
      surface_confirmation_token: "fresh-token"
    };
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection());
    vi.mocked(supplied.createV3)
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "warning",
          [],
          "surface_match_acknowledgement_required",
          [],
          { surface_match_page: replacementPage }
        )
      )
      .mockResolvedValueOnce({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));

    expect(
      await screen.findByText("匹配结果已更新，请重新确认后继续创建。")
    ).toBeVisible();
    fireEvent.click(screen.getByText("确认并创建，进入词形与发音"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(2));

    const calls = vi.mocked(supplied.createV3).mock.calls;
    expect(calls[1]?.[0]).not.toBe(calls[0]?.[0]);
    expect(calls[1]?.[1]).toMatchObject({
      confirmed_surface_match_token: "fresh-token"
    });
  });

  it("输入变化后忽略旧检查响应，只使用新输入的检查结果", async () => {
    const supplied = requests();
    const oldDetection = deferred<DetectLexiconSurfaceResponseV3>();
    vi.mocked(supplied.detectV3)
      .mockReturnValueOnce(oldDetection.promise)
      .mockResolvedValueOnce(
        v3Detection("centers", { detection_id: "detection-centers" })
      );
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.change(input(), { target: { value: "centers" } });
    await act(async () => oldDetection.resolve(v3Detection("center")));

    expect(supplied.createV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ detection_id: "detection-centers" })
    );
  });

  it("检测完成后修改输入会立即清除旧结果和创建入口", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("center"));
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    expect(
      await screen.findByRole("button", { name: "创建并进入词形与发音" })
    ).toBeVisible();

    fireEvent.change(input(), { target: { value: "centers" } });

    expect(
      screen.queryByRole("button", { name: "创建并进入词形与发音" })
    ).toBeNull();
    expect(screen.queryByText("词典检测结果")).toBeNull();
    expect(supplied.createV3).not.toHaveBeenCalled();
  });

  it("检测结果在创建前过期时要求重新检测且不发送创建请求", async () => {
    const supplied = requests();
    const now = Date.parse("2026-08-26T12:00:00Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(supplied.detectV3).mockResolvedValue(
      v3Detection("center", {
        expires_at: new Date(now + 1_000).toISOString()
      })
    );
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    const createButton = await screen.findByRole("button", {
      name: "创建并进入词形与发音"
    });
    nowSpy.mockReturnValue(now + 2_000);
    fireEvent.click(createButton);

    expect(
      await screen.findByText("检查结果已过期，请重新检测。")
    ).toBeVisible();
    expect(supplied.createV3).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "创建并进入词形与发音" })
    ).toBeNull();
    nowSpy.mockRestore();
  });

  it("创建请求进行中锁定输入和提交，且成功只处理一次", async () => {
    const supplied = requests();
    const creation = deferred<{ word: AdminWordV3 }>();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection());
    vi.mocked(supplied.createV3).mockReturnValue(creation.promise);
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    const createButton = await screen.findByText("创建并进入词形与发音");
    fireEvent.click(createButton);
    fireEvent.click(createButton);
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));

    expect(input()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /创建并进入词形与发音/ })
    ).toBeDisabled();
    await act(async () => creation.resolve({ word: v3Word() }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("卸载后丢弃尚未完成的检查和创建结果", async () => {
    const pendingDetection = deferred<DetectLexiconSurfaceResponseV3>();
    const detectRequests = requests();
    vi.mocked(detectRequests.detectV3).mockReturnValue(
      pendingDetection.promise
    );
    const detectCreated = vi.fn();
    const detectView = render(
      <AntApp>
        <UnifiedCreateEntryStep
          requests={detectRequests}
          onCreated={detectCreated}
        />
      </AntApp>
    );
    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    detectView.unmount();
    await act(async () => pendingDetection.resolve(v3Detection()));
    expect(detectRequests.createV3).not.toHaveBeenCalled();

    const createRequests = requests();
    const pendingCreation = deferred<{ word: AdminWordV3 }>();
    vi.mocked(createRequests.detectV3).mockResolvedValue(v3Detection());
    vi.mocked(createRequests.createV3).mockReturnValue(pendingCreation.promise);
    const createCreated = vi.fn();
    const createView = render(
      <AntApp>
        <UnifiedCreateEntryStep
          requests={createRequests}
          onCreated={createCreated}
        />
      </AntApp>
    );
    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));
    fireEvent.click(await screen.findByText("创建并进入词形与发音"));
    await waitFor(() => expect(createRequests.createV3).toHaveBeenCalled());
    createView.unmount();
    await act(async () => pendingCreation.resolve({ word: v3Word() }));
    expect(createCreated).not.toHaveBeenCalled();
  });

  it("V3 重复候选按词条归并并展示产品化详情", async () => {
    const supplied = requests();
    const page: SurfaceMatchPageV3 = {
      ...terminalV3Page(),
      total: 2,
      items: ["first", "second"].map((variant, index) => ({
        match_kind: "form_variant_v3" as const,
        match: {
          source_schema_version: 3 as const,
          entry_id: "internal-entry-id",
          entry_kind: "word" as const,
          status: "published" as const,
          content_scope: "current_publication" as const,
          pos_id: "internal-pos-id",
          group_ids: [],
          form_id: `internal-form-${index}`,
          variant_id: `internal-variant-${index}`,
          form_type: index === 0 ? ("base" as const) : ("plural" as const),
          dialect: index === 0 ? ("uk" as const) : ("us" as const),
          spelling: variant
        }
      })),
      matched_entry_contexts: [
        {
          entry_id: "internal-entry-id",
          presentation: {
            label: "existing entry",
            matched_surfaces: ["first", "second"],
            strategy_version: "surface_summary_v1"
          },
          pos_labels: ["noun"],
          gloss_previews: ["已有释义"],
          updated_at: "2026-08-26T00:00:00Z",
          inbound_relations: {
            total: 0,
            by_type: { synonym: 0, antonym: 0, derivative: 0 },
            previews: [],
            truncated: false
          }
        }
      ]
    };
    const detection = matchedV3Detection("center");
    vi.mocked(supplied.detectV3).mockResolvedValue({
      ...detection,
      requires_acknowledgement: true,
      surface_match_page: page
    });
    const existing = existingV3Word();
    existing.id = "internal-entry-id";
    existing.forms.pos[0]!.forms[0]!.id = "internal-form-0";
    existing.forms.pos[0]!.forms[0]!.regional_variants = {
      mode: "common",
      common: {
        id: "internal-common",
        dialect: "common",
        spelling: "first",
        origin: "dictionary",
        pronunciations: []
      }
    };
    vi.mocked(supplied.getWord).mockResolvedValue({ word: existing });
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("词典检测"));

    const summaryRow = (await screen.findByText("first")).closest<HTMLElement>(
      ".word-smart-match-summary-row"
    );
    expect(summaryRow).not.toBeNull();
    expect(within(summaryRow!).getByText("名词")).toBeVisible();
    fireEvent.click(screen.getByText("查看已有原形"));
    expect(await screen.findByText("原形：first")).toBeInTheDocument();
    expect(screen.queryByText("原形：second")).toBeNull();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.getByText("释义：已有释义")).toBeInTheDocument();
    expect(
      screen.queryByText(/internal-entry-id|internal-form|surface_summary/)
    ).toBeNull();
  });

  it("V3 phrase 原形命中时不阻断创建，并复用独立词条二次确认", async () => {
    const supplied = requests();
    const page = v3BaseFormPage();
    for (const item of page.items) {
      if (item.match_kind === "form_variant_v3") {
        item.match.entry_kind = "phrase";
      }
    }
    vi.mocked(supplied.detectV3).mockResolvedValue(
      v3PhraseDetection("in front of", {
        requires_acknowledgement: true,
        surface_match_page: page
      })
    );
    const existing = existingV3Word();
    existing.kind = "phrase";
    vi.mocked(supplied.getWord).mockResolvedValue({ word: existing });
    vi.mocked(supplied.createV3).mockResolvedValue({
      word: v3PhraseWord("in front of")
    });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "in front of" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(await screen.findByText("确认英美主词")).toBeVisible();
    expect(screen.getByText("短语词条")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "确认并创建，进入词形与发音"
      })
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "继续创建" }));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kind: "phrase" })
    );
  }, 15_000);

  it("分类回显不一致时 fail closed", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("give up"));
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(
      await screen.findByText("词条检查结果不一致，请刷新后重试。")
    ).toBeInTheDocument();
    expect(supplied.createV3).not.toHaveBeenCalled();
  });

  it.each([
    ["word", "center"],
    ["phrase", "give up"]
  ] as const)(
    "%s 检查结果过期时停止创建并要求重新提交",
    async (kind, value) => {
      const supplied = requests();
      if (kind === "word") {
        vi.mocked(supplied.detectV3).mockResolvedValue(
          v3Detection(value, {
            expires_at: new Date(Date.now() - 1_000).toISOString()
          })
        );
      } else {
        vi.mocked(supplied.detectV3).mockResolvedValue(
          v3PhraseDetection(value, {
            expires_at: new Date(Date.now() - 1_000).toISOString()
          })
        );
      }
      renderStep(supplied);

      fireEvent.change(input(), { target: { value } });
      fireEvent.click(screen.getByText("词典检测"));

      expect(
        await screen.findByText("检查结果已过期，请重新提交。")
      ).toBeInTheDocument();
      expect(supplied.createV3).not.toHaveBeenCalled();
    }
  );

  it("非法输入在请求前停止", async () => {
    const supplied = requests();
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "中文" } });
    fireEvent.click(screen.getByText("词典检测"));

    expect(
      await screen.findByText(/^仅支持英文词条，只能包含/)
    ).toBeInTheDocument();
    expect(supplied.detectV3).not.toHaveBeenCalled();
  });
});
