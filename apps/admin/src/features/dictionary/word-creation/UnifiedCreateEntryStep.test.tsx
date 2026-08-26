import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { HttpError } from "@tsz/api-client/http";
import type {
  AdminWordV3,
  DetectLexiconSurfaceResponseV3,
  SurfaceMatchPageV2,
  SurfaceMatchPageV3
} from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  detectionFixture,
  wordFixture
} from "./wordCreation.test.helper";

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
    matches: [],
    requires_acknowledgement: false,
    ...overrides
  };
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

function v2SurfacePage(
  mode: "terminal" | "disabled" | "loading"
): SurfaceMatchPageV2 {
  const base = {
    schema_version: 2 as const,
    snapshot_id: `snapshot-v2-${mode}`,
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "allow_new_exact_headword_entries" as const,
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
    surface_confirmation_token: "surface-token-v2"
  };
}

function matchedV3Detection(
  surface = "center"
): DetectLexiconSurfaceResponseV3 {
  return v3Detection(surface, {
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
    detectV2: vi.fn(),
    createV2: vi.fn(),
    detectV3: vi.fn(),
    createV3: vi.fn(),
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

beforeEach(() => vi.clearAllMocks());

describe("UnifiedCreateEntryStep", () => {
  it("单词一次提交后自动检测、创建并返回 V3 canonical word", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("can't"));
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "  can't  " } });
    fireEvent.click(screen.getByText("继续创建"));

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.detectV3).toHaveBeenCalledWith({
      schema_version: 3,
      language: "en",
      kind: "word",
      surface: "can't"
    });
    expect(supplied.detectV2).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(v3Word(), {
      creationSource: "blank"
    });
    expect(screen.queryByText(/检测 V3|创建 V3|schema|revision/)).toBeNull();
  });

  it("输入框按 Enter 触发同一条自动检测与创建链路", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection("center"));
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.keyDown(input(), { key: "Enter", code: "Enter" });

    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("短语折叠空白后自动使用 V2 phrase 链路", async () => {
    const supplied = requests();
    const detection = detectionFixture("give up");
    expect(detection.entry_kind).toBe("phrase");
    vi.mocked(supplied.detectV2).mockResolvedValue(detection);
    const phraseWord = {
      ...wordFixture({ headword: "center", id: "phrase-give-up" }),
      kind: "phrase" as const
    };
    vi.mocked(supplied.createV2).mockResolvedValue({ word: phraseWord });
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: " give\t\nup " } });
    fireEvent.click(screen.getByText("继续创建"));

    await waitFor(() => expect(supplied.createV2).toHaveBeenCalledTimes(1));
    expect(supplied.detectV2).toHaveBeenCalledWith({
      language: "en",
      headword: "give up"
    });
    expect(supplied.detectV3).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(phraseWord, {
      creationSource: "blank"
    });
  });

  it("V3 matched 在自动创建期间展示地区建议拼写、词性、词形与发音", async () => {
    const supplied = requests();
    const creation = deferred<{ word: AdminWordV3 }>();
    vi.mocked(supplied.detectV3).mockResolvedValue(matchedV3Detection());
    vi.mocked(supplied.createV3).mockReturnValue(creation.promise);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("已找到内置词典建议")).toBeVisible();
    expect(screen.getByText("英式建议拼写：centre")).toBeVisible();
    expect(screen.getByText("美式建议拼写：center")).toBeVisible();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("动词").length).toBeGreaterThan(0);
    expect(screen.getByText("复数")).toBeVisible();
    expect(screen.getByText("词典音标：ˈsentə")).toBeVisible();
    expect(screen.getByText(/实际发音：ˈsen\(t\)ər/)).toBeVisible();
    expect(screen.getByText("弱读")).toBeVisible();
    expect(screen.queryByText("matched")).toBeNull();
    expect(screen.queryByText("fixture-dictionary")).toBeNull();
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ detection_id: "detection-v3" })
    );

    await act(async () => creation.resolve({ word: v3Word() }));
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
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("已找到内置词典建议")).toBeVisible();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("动词").length).toBeGreaterThan(0);
  });

  it("V2 matched phrase 在自动创建期间展示正式英美主词与具体建议", async () => {
    const supplied = requests();
    const detection = detectionFixture("center");
    detection.request.headword = "in front of";
    detection.normalized_headword = "in front of";
    detection.entry_kind = "phrase";
    const phraseWord = {
      ...wordFixture({ id: "phrase-matched" }),
      kind: "phrase" as const
    };
    const creation = deferred<{ word: typeof phraseWord }>();
    vi.mocked(supplied.detectV2).mockResolvedValue(detection);
    vi.mocked(supplied.createV2).mockReturnValue(creation.promise);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "in front of" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("已找到内置词典建议")).toBeVisible();
    expect(screen.getByText("英式主词：centre")).toBeVisible();
    expect(screen.getByText("美式主词：center")).toBeVisible();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    expect(screen.getByText("现在分词")).toBeVisible();
    expect(screen.getByText(/词典音标：ˈsentərɪŋ/)).toBeVisible();
    expect(supplied.createV2).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        detection_id: detection.detection_id,
        headwords:
          detection.builtin_dictionary.status === "matched"
            ? detection.builtin_dictionary.headwords
            : undefined
      })
    );

    await act(async () => creation.resolve({ word: phraseWord }));
  });

  it("V2 通用建议与未知词性使用产品化回退", async () => {
    const supplied = requests();
    const detection = detectionFixture("center");
    detection.request.headword = "in common";
    detection.normalized_headword = "in common";
    detection.entry_kind = "phrase";
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("expected matched dictionary fixture");
    }
    detection.builtin_dictionary.headwords = {
      mode: "unified",
      common: "in common"
    };
    const phraseWord = {
      ...wordFixture({ id: "phrase-unified" }),
      kind: "phrase" as const
    };
    const creation = deferred<{ word: typeof phraseWord }>();
    vi.mocked(supplied.detectV2).mockResolvedValue(detection);
    vi.mocked(supplied.createV2).mockReturnValue(creation.promise);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "in common" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("通用主词：in common")).toBeVisible();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(0);
    await act(async () => creation.resolve({ word: phraseWord }));
  });

  it("not_found 明确说明空白草稿并自动继续，unavailable 则阻断", async () => {
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
    fireEvent.click(screen.getByText("继续创建"));
    expect(await screen.findByText("未找到内置词典建议")).toBeVisible();
    expect(
      screen.getByText("将创建空白草稿，请在编辑器中补充内容。")
    ).toBeVisible();
    expect(notFoundRequests.createV3).toHaveBeenCalledTimes(1);
    unmount();

    const unavailableRequests = requests();
    vi.mocked(unavailableRequests.detectV3).mockResolvedValue(
      v3Detection("unavailable", {
        builtin_dictionary: { status: "unavailable", retry_after_seconds: 3 }
      })
    );
    renderStep(unavailableRequests);
    fireEvent.change(input(), { target: { value: "unavailable" } });
    fireEvent.click(screen.getByText("继续创建"));

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
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("发现可能重复的词条")).toBeInTheDocument();
    expect(screen.queryByText("snapshot-v3")).toBeNull();
    expect(screen.queryByText("surface-token")).toBeNull();
    fireEvent.click(screen.getByText("确认并继续创建"));

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
    fireEvent.click(screen.getByText("继续创建"));
    expect(
      await screen.findByText("网络异常，创建结果未知。请原样重试。")
    ).toBeVisible();

    fireEvent.click(screen.getByText("继续创建"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(2));

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

  it("未知异常只展示安全的产品错误", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection());
    vi.mocked(supplied.createV3).mockRejectedValue({ internal: "secret" });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("创建失败，请稍后重试。")).toBeVisible();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("V2 警告确认携带 token，禁用与分页失败状态保持阻断", async () => {
    const terminalRequests = requests();
    const terminalDetection = detectionFixture("give up");
    terminalDetection.entry_kind = "phrase";
    terminalDetection.smart_dictionary = {
      status: "warning",
      duplicates: [],
      surface_match_page: v2SurfacePage("terminal"),
      matched_entry_contexts: []
    };
    const phraseWord = {
      ...wordFixture({ id: "phrase-warning" }),
      kind: "phrase" as const
    };
    vi.mocked(terminalRequests.detectV2).mockResolvedValue(terminalDetection);
    vi.mocked(terminalRequests.createV2).mockResolvedValue({
      word: phraseWord
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
    fireEvent.click(screen.getByText("继续创建"));
    fireEvent.click(await screen.findByText("确认并继续创建"));
    await waitFor(() => expect(terminalRequests.createV2).toHaveBeenCalled());
    expect(terminalRequests.createV2).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        confirmed_surface_match_token: "surface-token-v2"
      })
    );
    terminalView.unmount();

    const disabledRequests = requests();
    const disabledDetection = detectionFixture("give up");
    disabledDetection.entry_kind = "phrase";
    disabledDetection.smart_dictionary = {
      status: "warning",
      duplicates: [],
      surface_match_page: v2SurfacePage("disabled"),
      matched_entry_contexts: []
    };
    vi.mocked(disabledRequests.detectV2).mockResolvedValue(disabledDetection);
    const disabledView = render(
      <AntApp>
        <UnifiedCreateEntryStep
          requests={disabledRequests}
          onCreated={vi.fn()}
        />
      </AntApp>
    );
    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("继续创建"));
    expect(
      await screen.findByText("当前策略暂不允许继续创建该词条。")
    ).toBeVisible();
    disabledView.unmount();

    const failedRequests = requests();
    const failedDetection = detectionFixture("give up");
    failedDetection.entry_kind = "phrase";
    failedDetection.smart_dictionary = {
      status: "warning",
      duplicates: [],
      surface_match_page: v2SurfacePage("loading"),
      matched_entry_contexts: []
    };
    vi.mocked(failedRequests.detectV2).mockResolvedValue(failedDetection);
    vi.mocked(failedRequests.surfacePage).mockRejectedValue(
      new Error("page failed")
    );
    renderStep(failedRequests);
    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("继续创建"));
    expect(
      await screen.findByText("匹配结果已失效，请返回修改后重新提交。")
    ).toBeVisible();
    expect(failedRequests.createV2).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByText("继续创建"));

    expect(
      await screen.findByText("匹配结果已更新，请重新确认后继续创建。")
    ).toBeVisible();
    fireEvent.click(screen.getByText("确认并继续创建"));
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
    fireEvent.click(screen.getByText("继续创建"));
    fireEvent.change(input(), { target: { value: "centers" } });
    await act(async () => oldDetection.resolve(v3Detection("center")));

    expect(supplied.createV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("继续创建"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));
    expect(supplied.createV3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ detection_id: "detection-centers" })
    );
  });

  it("创建请求进行中锁定输入和提交，且成功只处理一次", async () => {
    const supplied = requests();
    const creation = deferred<{ word: AdminWordV3 }>();
    vi.mocked(supplied.detectV3).mockResolvedValue(v3Detection());
    vi.mocked(supplied.createV3).mockReturnValue(creation.promise);
    const onCreated = renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("继续创建"));
    await waitFor(() => expect(supplied.createV3).toHaveBeenCalledTimes(1));

    expect(input()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /正在检查并创建/ })
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
    fireEvent.click(screen.getByText("继续创建"));
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
    fireEvent.click(screen.getByText("继续创建"));
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
    vi.mocked(supplied.createV3).mockResolvedValue({ word: v3Word() });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "center" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("existing entry")).toBeVisible();
    expect(screen.getByText("命中 2 处")).toBeVisible();
    expect(screen.getByText("单词")).toBeVisible();
    fireEvent.click(screen.getByText("查看候选详情"));
    expect(
      await screen.findByText("词形 · first · 原形 · 英式")
    ).toBeInTheDocument();
    expect(screen.getByText("词形 · second · 复数 · 美式")).toBeInTheDocument();
    expect(screen.getAllByText("名词").length).toBeGreaterThan(1);
    expect(screen.getByText("释义：已有释义")).toBeInTheDocument();
    expect(
      screen.queryByText(/internal-entry-id|internal-form|surface_summary/)
    ).toBeNull();
  });

  it("V2 duplicate 保留建议摘要并展示已有候选，且不创建", async () => {
    const supplied = requests();
    const detection = detectionFixture("center");
    detection.request.headword = "in front of";
    detection.normalized_headword = "in front of";
    detection.entry_kind = "phrase";
    detection.smart_dictionary = {
      status: "duplicate",
      duplicates: [
        {
          word_id: "internal-duplicate-id",
          headword: "in front of",
          dialect: "common",
          status: "draft"
        }
      ]
    };
    vi.mocked(supplied.detectV2).mockResolvedValue(detection);
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "in front of" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText("已找到内置词典建议")).toBeVisible();
    expect(screen.getByText("智能词库中已有相同词条")).toBeVisible();
    expect(screen.getByText("in front of")).toBeVisible();
    expect(screen.getByText("短语")).toBeVisible();
    expect(screen.getByText("草稿")).toBeVisible();
    fireEvent.click(screen.getByText("查看候选详情"));
    expect(
      await screen.findByText("命中原因：已有相同主词 · 通用")
    ).toBeInTheDocument();
    expect(screen.queryByText("internal-duplicate-id")).toBeNull();
    expect(supplied.createV2).not.toHaveBeenCalled();
  });

  it("分类回显不一致时 fail closed", async () => {
    const supplied = requests();
    vi.mocked(supplied.detectV2).mockResolvedValue({
      ...detectionFixture("give up"),
      entry_kind: "word"
    });
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "give up" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(
      await screen.findByText("词条检查结果不一致，请刷新后重试。")
    ).toBeInTheDocument();
    expect(supplied.createV2).not.toHaveBeenCalled();
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
        const detection = detectionFixture(value);
        detection.entry_kind = "phrase";
        detection.expires_at = new Date(Date.now() - 1_000).toISOString();
        vi.mocked(supplied.detectV2).mockResolvedValue(detection);
      }
      renderStep(supplied);

      fireEvent.change(input(), { target: { value } });
      fireEvent.click(screen.getByText("继续创建"));

      expect(
        await screen.findByText("检查结果已过期，请重新提交。")
      ).toBeInTheDocument();
      expect(supplied.createV2).not.toHaveBeenCalled();
      expect(supplied.createV3).not.toHaveBeenCalled();
    }
  );

  it("非法输入在请求前停止", async () => {
    const supplied = requests();
    renderStep(supplied);

    fireEvent.change(input(), { target: { value: "中文" } });
    fireEvent.click(screen.getByText("继续创建"));

    expect(await screen.findByText(/仅支持英文词条/)).toBeInTheDocument();
    expect(supplied.detectV2).not.toHaveBeenCalled();
    expect(supplied.detectV3).not.toHaveBeenCalled();
  });
});
