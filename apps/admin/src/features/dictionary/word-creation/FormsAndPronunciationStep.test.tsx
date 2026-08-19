import { HttpError } from "@tsz/api-client/http";
import type { DraftFormsStepContent, SurfaceMatchPageV2 } from "@tsz/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { useState } from "react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminWordsMock } from "../mock/adminWordsMock";
import { FormsAndPronunciationStep } from "./FormsAndPronunciationStep";
import { partOfSpeechCatalogFixture } from "./partOfSpeech.test.helper";
import { deferred, wordFixture } from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  preview: vi.fn(),
  save: vi.fn(),
  suggest: vi.fn(),
  surfacePage: vi.fn()
}));
const dataSourceCapabilities = vi.hoisted(() => ({
  dialectVariantSuggestions: true
}));
const catalogState = vi.hoisted(() => ({
  data: undefined as typeof partOfSpeechCatalogFixture | undefined
}));
vi.mock("../dataSource", () => ({
  adminWordsDataSourceCapabilities: dataSourceCapabilities,
  adminWordsDataSource: {
    surfaceMatchSnapshotPage: mutations.surfacePage
  }
}));

vi.mock("./api", () => ({
  usePreviewFormsImpact: () => ({
    mutateAsync: mutations.preview,
    isPending: false
  }),
  useSaveFormsStep: () => ({
    mutateAsync: mutations.save,
    isPending: false
  }),
  useSuggestDialectVariants: () => ({
    mutateAsync: mutations.suggest,
    isPending: false
  })
}));

vi.mock("../part-of-speech/api", () => {
  return {
    usePartOfSpeechCatalog: () => ({
      data: catalogState.data,
      isError: false,
      isPending: false,
      isLoading: false
    })
  };
});

function button(label: string): HTMLButtonElement {
  // A whole-tree role query is extremely slow for this large AntD editor.
  const result = screen
    .getAllByText(label, { exact: true })
    .map((item) => item.closest("button"))
    .find((item): item is HTMLButtonElement => item !== null);
  if (!result) throw new Error(`button not found: ${label}`);
  return result as HTMLButtonElement;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </span>
  );
}

function renderStep(
  word = wordFixture(),
  locationState?: { nodeId: string; field: string },
  readOnly = false
) {
  const onSaved = vi.fn();
  let updateRenderedWord:
    ((next: ReturnType<typeof wordFixture>) => void) | undefined;
  function StepUnderTest() {
    const [renderedWord, setRenderedWord] = useState(word);
    updateRenderedWord = (next) => setRenderedWord(next);
    return (
      <>
        <FormsAndPronunciationStep
          word={renderedWord}
          readOnly={readOnly}
          onSaved={onSaved}
        />
        <LocationProbe />
      </>
    );
  }
  const router = createMemoryRouter(
    [
      {
        path: "/words/:wordId/wizard/forms",
        element: <StepUnderTest />
      },
      {
        path: "/words/:wordId/wizard/:step",
        element: <LocationProbe />
      },
      {
        path: "/words/new",
        element: <LocationProbe />
      }
    ],
    {
      initialEntries: [
        {
          pathname: `/words/${word.id}/wizard/forms`,
          state: locationState
        }
      ]
    }
  );
  render(
    <AntApp>
      <RouterProvider router={router} />
    </AntApp>
  );
  return {
    onSaved,
    router,
    rerenderWord(next: ReturnType<typeof wordFixture>) {
      if (!updateRenderedWord) throw new Error("step harness is not mounted");
      act(() => updateRenderedWord?.(next));
    }
  };
}

function surfacePageFixture({
  word = wordFixture(),
  posIndex = 0,
  snapshotId = "forms-snapshot-1",
  matchId = "forms-match-1",
  existingWordId = "word-workspaces",
  surface = "workspaces",
  total = 1,
  nextCursor = null,
  surfaceToken = "surface-token-1",
  impactToken
}: {
  word?: ReturnType<typeof wordFixture>;
  posIndex?: number;
  snapshotId?: string;
  matchId?: string;
  existingWordId?: string;
  surface?: string;
  total?: number;
  nextCursor?: string | null;
  surfaceToken?: string;
  impactToken?: string;
} = {}): SurfaceMatchPageV2 {
  const pos = word.forms.pos[posIndex]!;
  const slot = pos.form_groups[0]?.slots[0] ?? pos.base_form;
  const dialect = slot.variants[0]?.dialect ?? "common";
  const candidateNodeId = slot.variants[0]?.id ?? slot.id;
  const page = {
    snapshot_id: snapshotId,
    items: [
      {
        match_id: matchId,
        match_category: "form_headword" as const,
        severity: "warning" as const,
        attention_level: "normal" as const,
        can_continue: true as const,
        confirmation_reasons: ["unacknowledged_surface_matches" as const],
        candidate: {
          candidate_type: "form" as const,
          candidate_ref: `${pos.pos_id}:${slot.id}:${dialect}`,
          candidate_word_id: word.id,
          candidate_node_id: candidateNodeId,
          surface,
          normalized_surface: surface,
          dialect,
          pos_id: pos.pos_id,
          pos: pos.pos,
          form_type: slot.form_type
        },
        existing: {
          word_id: existingWordId,
          headword: surface,
          kind: "word" as const,
          status: "draft" as const,
          source: {
            source_kind: "headword" as const,
            source_id: `${existingWordId}-headword`,
            content_scope: "draft" as const,
            surface,
            dialect
          }
        }
      }
    ],
    total,
    matched_entry_contexts: [
      {
        word_id: existingWordId,
        pos_labels: ["noun"],
        gloss_previews: ["工作区"],
        updated_at: "2026-08-16T00:00:00.000Z",
        inbound_relations: {
          total: 0,
          by_type: { synonym: 0, antonym: 0, derivative: 0 },
          previews: [],
          truncated: false
        }
      }
    ],
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "surface_warning_acknowledgement" as const,
    policy_epoch: 1,
    continuation_policy: "enabled" as const
  };
  return nextCursor === null
    ? {
        ...page,
        next_cursor: null,
        surface_confirmation_token: surfaceToken,
        ...(impactToken ? { impact_confirmation_token: impactToken } : {})
      }
    : { ...page, next_cursor: nextCursor };
}

beforeEach(() => {
  vi.clearAllMocks();
  mutations.surfacePage.mockReset();
  catalogState.data = partOfSpeechCatalogFixture;
  dataSourceCapabilities.dialectVariantSuggestions = true;
  mutations.preview.mockResolvedValue({
    base_revision: 3,
    requires_confirmation: false,
    affected: []
  });
  mutations.save.mockResolvedValue({ word: wordFixture({ revision: 4 }) });
  vi.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe("FormsAndPronunciationStep", () => {
  it("无派生词形能力的代词只校验原形并以零派生组完成", async () => {
    const word = wordFixture();
    const pronoun = word.forms.pos[0]!;
    pronoun.pos = "pronoun";
    pronoun.form_groups = [
      { id: "legacy-empty-pronoun-group", is_regular: true, slots: [] }
    ];
    renderStep(word);

    expect(screen.getByText("当前基本词性无需派生词形")).toBeVisible();
    expect(screen.queryByText("添加派生词形")).toBeNull();
    expect(screen.queryByText("添加一组替代词形变化")).toBeNull();
    fireEvent.click(button("完成并进入词义与例句"));

    await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(1));
    expect(
      mutations.preview.mock.calls[0]![0].content.pos[0].form_groups
    ).toEqual([]);
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save.mock.calls[0]![0].content.pos[0].form_groups).toEqual(
      []
    );
    expect(
      screen.queryByText(/代词有 1 组词形变化尚未添加派生词形/)
    ).toBeNull();
  });

  it("无派生能力词性的历史非空派生数据保存草稿时不被静默清空", async () => {
    const word = wordFixture();
    const pronoun = word.forms.pos[0]!;
    pronoun.pos = "pronoun";
    const legacyGroups = structuredClone(pronoun.form_groups);
    renderStep(word);

    expect(screen.getByText("当前基本词性无需派生词形")).toBeVisible();
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save.mock.calls[0]![0].content.pos[0].form_groups).toEqual(
      legacyGroups
    );
  });

  it("catalog 未下发词形能力时禁止新增和完成", async () => {
    catalogState.data = {
      ...partOfSpeechCatalogFixture,
      items: partOfSpeechCatalogFixture.items.map(
        ({
          allowed_form_types: _allowed,
          default_form_types: _defaults,
          ...item
        }) => item
      )
    };
    renderStep();

    expect(screen.getByText("词形规则未加载")).toBeVisible();
    expect(
      screen.getByText(
        "现有词形仅供查看；重新加载到服务端词性能力后才能新增或完成本步骤。"
      )
    ).toBeVisible();
    expect(button("添加派生词形")).toBeDisabled();

    fireEvent.click(button("完成并进入词义与例句"));
    expect(await screen.findByText("名词的词形规则未加载")).toBeVisible();
    expect(mutations.preview).not.toHaveBeenCalled();
  });

  it("默认词形为空时仍可添加允许的派生词形", () => {
    catalogState.data = {
      ...partOfSpeechCatalogFixture,
      items: partOfSpeechCatalogFixture.items.map((item) =>
        item.code === "noun" ? { ...item, default_form_types: [] } : item
      )
    };
    renderStep();

    fireEvent.click(button("添加派生词形"));

    expect(screen.getByText("复数")).toBeVisible();
    expect(button("添加派生词形")).toBeDisabled();
  });

  it("词形与发音只使用基本词性，不展示配置层级的细分词性 Tab", () => {
    renderStep();

    expect(screen.getByLabelText("添加基本词性")).toBeVisible();
    expect(screen.queryByLabelText("添加细分词性")).toBeNull();
    expect(screen.queryByRole("tab", { name: "细分词性" })).toBeNull();
    expect(screen.getByText("名词", { exact: true })).toBeVisible();
  });

  it("点击词形变化组头部可收起并重新展开", () => {
    renderStep();

    const collapseButton = screen.getByRole("button", {
      name: "收起第 1 组词形变化"
    });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByLabelText("管理第 1 组词形变化")).toBeNull();
    expect(screen.getAllByLabelText("英式词形拼写").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("播放语音").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("获取语音").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("上传语音")).toBeNull();
    expect(screen.getByText("添加一组替代词形变化")).toBeVisible();
    expect(screen.getByText("添加派生词形")).toBeVisible();

    fireEvent.click(collapseButton);

    const expandButton = screen.getByRole("button", {
      name: "展开第 1 组词形变化"
    });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByLabelText("英式词形拼写")).toHaveLength(0);

    fireEvent.click(expandButton);

    expect(
      screen.getByRole("button", { name: "收起第 1 组词形变化" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByLabelText("英式词形拼写").length).toBeGreaterThan(0);
  });

  it("可新增第二组词形变化并独立收起", () => {
    renderStep();

    fireEvent.click(button("添加一组替代词形变化"));

    const secondGroupToggle = screen.getByRole("button", {
      name: "收起第 2 组词形变化"
    });
    expect(secondGroupToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("添加派生词形")).toHaveLength(2);
    fireEvent.click(secondGroupToggle);
    expect(
      screen.getByRole("button", { name: "展开第 2 组词形变化" })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("可通过拖动手柄调整同一方言内的读音顺序", async () => {
    const word = wordFixture();
    const ukVariant = word.forms.pos[0]!.base_form.variants.find(
      (variant) => variant.dialect === "uk"
    )!;
    ukVariant.pronunciations.push({
      ...ukVariant.pronunciations[0]!,
      id: "uk-pronunciation-2",
      dict_phonetic: "second-dict",
      actual_pron: "second-actual"
    });
    const originalIds = ukVariant.pronunciations.map((item) => item.id);
    renderStep(word);
    const sourceHandle = screen
      .getAllByLabelText("拖动英式原形读音 1")
      .find((item) => !(item as HTMLButtonElement).disabled)!;
    const targetHandle = screen.getByLabelText("拖动英式原形读音 2");
    const target = targetHandle.closest(".word-pronunciation-editor")!;
    const store = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      types: ["application/x-tsz-pronunciation"],
      setData: (type: string, data: string) => store.set(type, data),
      getData: (type: string) => store.get(type) ?? ""
    };

    fireEvent.dragStart(sourceHandle, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer });
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedUk =
      mutations.save.mock.calls[0]![0].content.pos[0].base_form.variants.find(
        (variant: { dialect: string }) => variant.dialect === "uk"
      );
    expect(
      savedUk.pronunciations.map((item: { id: string }) => item.id)
    ).toEqual([...originalIds].reverse());
  });

  it("编辑后完成保存并放行到 meanings，提交 revision 与干净 content", async () => {
    const word = wordFixture();
    const saved = wordFixture({ revision: 4, max_reachable_step: "meanings" });
    mutations.save.mockResolvedValue({ word: saved });
    const { onSaved, router } = renderStep(word);
    const actualPronunciation = screen.getAllByLabelText("实际发音")[0]!;

    fireEvent.change(actualPronunciation, {
      target: { value: "changed-pronunciation" }
    });
    fireEvent.click(button("完成并进入词义与例句"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.preview).toHaveBeenCalledWith(
      expect.objectContaining({ base_revision: word.revision })
    );
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        base_revision: word.revision,
        intent: "complete",
        content: expect.objectContaining({ pos: expect.any(Array) })
      })
    );
    const payload = mutations.save.mock.calls[0]![0];
    expect(payload).not.toHaveProperty("operation_id");
    expect(payload).not.toHaveProperty("confirmed_impact_token");
    expect(
      payload.content.pos[0].base_form.variants[0].pronunciations[0].actual_pron
    ).toBe("changed-pronunciation");
    expect(onSaved).toHaveBeenCalledWith(saved);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/words/${word.id}/wizard/meanings`
      )
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("保存失败保留用户编辑值并停留当前步骤", async () => {
    mutations.save.mockRejectedValue(new Error("forms save failed"));
    const { router } = renderStep();
    const input = screen.getAllByLabelText("实际发音")[0]!;
    fireEvent.change(input, { target: { value: "keep-this-pronunciation" } });

    fireEvent.click(button("保存草稿"));

    expect(await screen.findByText("forms save failed")).toBeInTheDocument();
    expect(input).toHaveValue("keep-this-pronunciation");
    expect(router.state.location.pathname).toBe(
      "/words/word-center/wizard/forms"
    );
  });

  it("影响预览与保存请求在途时锁定编辑区", async () => {
    const pending = deferred<{ word: ReturnType<typeof wordFixture> }>();
    mutations.save.mockReturnValue(pending.promise);
    const saved = wordFixture({ revision: 4 });
    const { onSaved } = renderStep();
    const input = screen.getAllByLabelText("实际发音")[0]!;
    fireEvent.change(input, { target: { value: "before-request" } });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input).toBeDisabled());

    await act(async () => pending.resolve({ word: saved }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it("完成前执行客户端基准发音校验，不请求影响预览或保存", async () => {
    const word = wordFixture();
    word.forms.pos[0]!.base_form.variants[0]!.pronunciations[0]!.dict_phonetic =
      "";
    renderStep(word);

    fireEvent.click(button("完成并进入词义与例句"));

    expect(
      await screen.findByText("名词基准原形缺少字典音标或实际发音")
    ).toBeInTheDocument();
    expect(screen.getByText("本步骤还有 1 项待修正")).toBeInTheDocument();
    expect(mutations.preview).not.toHaveBeenCalled();
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("允许支持派生词的具体单词以空词形组完成", async () => {
    const word = wordFixture();
    word.forms.pos[0]!.form_groups = [
      { id: "empty-group-1", is_regular: true, slots: [] },
      { id: "empty-group-2", is_regular: false, slots: [] }
    ];
    renderStep(word);

    fireEvent.click(button("完成并进入词义与例句"));

    await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/词形变化尚未添加派生词形/)).toBeNull();
  });

  it("当前组已使用全部合法类型时禁用新增，历史重复类型即时标红", () => {
    const word = wordFixture();
    const nounGroup = word.forms.pos[0]!.form_groups[0]!;
    nounGroup.slots.push({
      ...structuredClone(nounGroup.slots[0]!),
      id: "historical-duplicate-plural"
    });
    renderStep(word);

    expect(button("添加派生词形")).toBeDisabled();
    expect(button("添加派生词形")).toHaveAttribute(
      "title",
      "当前组已添加全部可用词形类型"
    );
    expect(
      screen.getAllByText("同组内词形类型不能重复").length
    ).toBeGreaterThan(0);
  });

  it("tomato 填入 tomatoes 后可完成，保存 wire 保留 plural slot 与 variant", async () => {
    const word = wordFixture({ headword: "tomato" });
    const pos = word.forms.pos[0]!;
    const slot = {
      id: "tomato-plural-slot",
      form_type: "plural" as const,
      variants: [
        {
          id: "tomatoes-common-variant",
          dialect: "common" as const,
          spelling: "tomatoes",
          origin: "dictionary" as const,
          pronunciations: [
            {
              id: "tomatoes-pronunciation",
              dict_phonetic: "/təˈmɑːtoʊz/",
              actual_pron: "təˈmɑːtoʊz",
              style: "normal" as const
            }
          ]
        }
      ]
    };
    pos.form_groups[0]!.slots = [slot];
    renderStep(word);

    fireEvent.click(button("完成并进入词义与例句"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save.mock.calls[0]![0]).toMatchObject({
      intent: "complete",
      content: {
        pos: [
          {
            base_form: { form_type: "base" },
            form_groups: [
              {
                slots: [
                  {
                    id: "tomato-plural-slot",
                    form_type: "plural",
                    variants: [
                      {
                        id: "tomatoes-common-variant",
                        dialect: "common",
                        spelling: "tomatoes"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    });
  });

  it("可上移替代词形组，保存 payload 保留新的稳定顺序", async () => {
    const word = wordFixture();
    word.forms.pos[0]!.form_groups.push({
      id: "manual-group-2",
      is_regular: false,
      slots: []
    });
    const originalGroups = word.forms.pos[0]!.form_groups.map(
      (group) => group.id
    );
    renderStep(word);

    fireEvent.click(screen.getByLabelText("管理第 2 组词形变化"));
    fireEvent.click(await screen.findByText("上移本组"));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const payload = mutations.save.mock.calls[0]![0];
    expect(
      payload.content.pos[0].form_groups.map(
        (group: { id: string }) => group.id
      )
    ).toEqual([...originalGroups].reverse());
  });

  it("缺失方言词形经服务建议和二次确认后写入 converted variant", async () => {
    const word = wordFixture();
    const slot = word.forms.pos[0]!.form_groups[0]!.slots[0]!;
    slot.variants = slot.variants.filter((variant) => variant.dialect === "us");
    mutations.suggest.mockResolvedValue({
      suggestions: [
        {
          client_id: slot.id,
          field_kind: "form",
          value: "centres-generated",
          model_version: "mock-v1"
        }
      ]
    });
    renderStep(word);

    fireEvent.click(button("生成英式建议"));
    expect(
      (await screen.findAllByText("确认英式词形建议")).length
    ).toBeGreaterThan(0);
    fireEvent.click(button("写入建议"));

    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("英式词形拼写")
          .some(
            (input) => (input as HTMLInputElement).value === "centres-generated"
          )
      ).toBe(true)
    );
    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedSlot =
      mutations.save.mock.calls[0]![0].content.pos[0].form_groups[0].slots[0];
    expect(savedSlot.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dialect: "uk",
          spelling: "centres-generated",
          origin: "converted"
        })
      ])
    );
  });

  it("建议响应期间手工填写目标方言，确认后保留最新手工内容", async () => {
    const word = wordFixture();
    const slot = word.forms.pos[0]!.form_groups[0]!.slots[0]!;
    slot.variants = slot.variants.filter((variant) => variant.dialect === "us");
    const pending = deferred<{
      suggestions: Array<{
        client_id: string;
        field_kind: "form";
        value: string;
        model_version: string;
      }>;
    }>();
    mutations.suggest.mockReturnValue(pending.promise);
    renderStep(word);

    fireEvent.click(button("生成英式建议"));
    await waitFor(() => expect(mutations.suggest).toHaveBeenCalledTimes(1));
    fireEvent.click(button("手工填写"));
    const manualInput = screen
      .getAllByLabelText("英式词形拼写")
      .find((input) => (input as HTMLInputElement).value === "")!;
    fireEvent.change(manualInput, { target: { value: "manually-entered" } });

    await act(async () =>
      pending.resolve({
        suggestions: [
          {
            client_id: slot.id,
            field_kind: "form",
            value: "generated-too-late",
            model_version: "mock-v1"
          }
        ]
      })
    );
    expect(
      (await screen.findAllByText("确认英式词形建议")).length
    ).toBeGreaterThan(0);
    fireEvent.click(button("写入建议"));

    await waitFor(() => expect(manualInput).toHaveValue("manually-entered"));
    expect(
      screen
        .getAllByLabelText("英式词形拼写")
        .some(
          (input) => (input as HTMLInputElement).value === "generated-too-late"
        )
    ).toBe(false);
    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedSlot =
      mutations.save.mock.calls[0]![0].content.pos[0].form_groups[0].slots[0];
    expect(savedSlot.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dialect: "uk",
          spelling: "manually-entered",
          origin: "manual"
        })
      ])
    );
  });

  it.each([
    {
      label: "client_id 不匹配",
      suggestions: [
        {
          client_id: "another-slot",
          field_kind: "form",
          value: "wrong-slot",
          model_version: "mock-v1"
        }
      ]
    },
    {
      label: "重复响应",
      suggestions: [
        {
          client_id: "__slot__",
          field_kind: "form",
          value: "first",
          model_version: "mock-v1"
        },
        {
          client_id: "__slot__",
          field_kind: "form",
          value: "second",
          model_version: "mock-v1"
        }
      ]
    }
  ])("拒绝$label且不打开写入确认", async ({ suggestions }) => {
    const word = wordFixture();
    const slot = word.forms.pos[0]!.form_groups[0]!.slots[0]!;
    slot.variants = slot.variants.filter((variant) => variant.dialect === "us");
    mutations.suggest.mockResolvedValue({
      suggestions: suggestions.map((suggestion) => ({
        ...suggestion,
        client_id:
          suggestion.client_id === "__slot__" ? slot.id : suggestion.client_id
      }))
    });
    renderStep(word);

    fireEvent.click(button("生成英式建议"));

    expect(
      await screen.findByText("词形建议响应无效，请重试")
    ).toBeInTheDocument();
    expect(screen.queryByText("确认英式词形建议")).toBeNull();
  });

  it("真实建议服务未接入时禁用生成按钮并保留手工填写", () => {
    dataSourceCapabilities.dialectVariantSuggestions = false;
    const word = wordFixture();
    const slot = word.forms.pos[0]!.form_groups[0]!.slots[0]!;
    slot.variants = slot.variants.filter((variant) => variant.dialect === "us");
    renderStep(word);

    expect(button("生成英式建议")).toBeDisabled();
    expect(button("生成英式建议")).toHaveAttribute(
      "title",
      "真实方言建议服务尚未接入，请手工填写"
    );
    expect(button("手工填写")).toBeEnabled();
    fireEvent.click(button("生成英式建议"));
    expect(mutations.suggest).not.toHaveBeenCalled();
  });

  it("影响预览要求确认时，只有确认后才携 token 保存", async () => {
    const word = wordFixture();
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: true,
      affected: [
        { node_id: "sense-1", node_type: "sense", reason: "词义将被重建" }
      ],
      confirmation_token: "impact-token-1"
    });
    renderStep(word);

    fireEvent.click(button("保存草稿"));
    expect(
      (await screen.findAllByText("本次修改会影响后续内容")).length
    ).toBeGreaterThan(0);
    expect(mutations.save).not.toHaveBeenCalled();
    fireEvent.click(button("确认并保存"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed_impact_token: "impact-token-1" })
    );
  });

  it("dirty 内容遇到同 entry refetch 时仍以内容加载时的 revision 预检", async () => {
    const word = wordFixture();
    mutations.preview.mockRejectedValue(
      new HttpError(409, "revision conflict", [], "revision_conflict")
    );
    const { rerenderWord } = renderStep(word);
    const input = screen.getAllByLabelText("实际发音")[0]!;
    fireEvent.change(input, { target: { value: "dirty-before-refetch" } });

    rerenderWord(wordFixture({ revision: word.revision + 1 }));
    expect(input).toHaveValue("dirty-before-refetch");
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(1));
    expect(mutations.preview).toHaveBeenCalledWith(
      expect.objectContaining({ base_revision: word.revision })
    );
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("确认窗打开后同 entry refetch 不改变本次 preview 绑定的 save revision", async () => {
    const word = wordFixture();
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: true,
      affected: [
        { node_id: "sense-1", node_type: "sense", reason: "词义将被重建" }
      ],
      confirmation_token: "impact-token-before-refetch"
    });
    const { rerenderWord } = renderStep(word);

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    rerenderWord(wordFixture({ revision: word.revision + 1 }));
    fireEvent.click(button("确认并保存"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        base_revision: word.revision,
        confirmed_impact_token: "impact-token-before-refetch"
      })
    );
  });

  it("仅有 surface warning 时加载终页并只携 surface token 保存", async () => {
    const word = wordFixture();
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: false,
      affected: [],
      surface_match_page: surfacePageFixture({ word })
    });
    renderStep(word);

    fireEvent.click(button("保存草稿"));
    expect(await screen.findByText("保存前请确认同形提示")).toBeInTheDocument();
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    fireEvent.click(button("确认并保存"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const payload = mutations.save.mock.calls[0]![0];
    expect(payload.confirmed_surface_match_token).toBe("surface-token-1");
    expect(payload).not.toHaveProperty("confirmed_impact_token");
  });

  it("多个同名跨 entry 命中展示精确身份、来源和新标签页入口", async () => {
    const word = wordFixture();
    const firstWordId = "word-workspaces-draft-0001";
    const secondWordId = "word-workspaces-published-0002";
    const firstPage = surfacePageFixture({
      word,
      existingWordId: firstWordId,
      matchId: "forms-match-draft"
    });
    const secondPage = surfacePageFixture({
      word,
      existingWordId: secondWordId,
      matchId: "forms-match-published"
    });
    const secondItem = structuredClone(secondPage.items[0]!);
    secondItem.existing.kind = "phrase";
    secondItem.existing.status = "published";
    secondItem.existing.source.content_scope = "current_publication";
    secondItem.existing.source.dialect = "us";
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: false,
      affected: [],
      surface_match_page: {
        ...firstPage,
        items: [firstPage.items[0]!, secondItem],
        total: 2,
        matched_entry_contexts: [
          firstPage.matched_entry_contexts[0]!,
          {
            ...secondPage.matched_entry_contexts[0]!,
            word_id: secondWordId,
            inbound_relations: {
              ...secondPage.matched_entry_contexts[0]!.inbound_relations,
              total: 3
            }
          }
        ]
      }
    });
    renderStep(word);

    fireEvent.click(button("保存草稿"));

    const firstLink = await screen.findByRole("link", {
      name: `workspaces ${firstWordId}，在新标签页打开`
    });
    const secondLink = screen.getByRole("link", {
      name: `workspaces ${secondWordId}，在新标签页打开`
    });
    expect(firstLink).toHaveAttribute(
      "href",
      `/words/${firstWordId}/wizard/basics`
    );
    expect(secondLink).toHaveAttribute(
      "href",
      `/words/${secondWordId}/wizard/basics`
    );
    expect(firstLink).toHaveAttribute("target", "_blank");
    expect(secondLink).toHaveAttribute("target", "_blank");
    const secondCard = secondLink.closest(".ant-card");
    expect(secondCard).not.toBeNull();
    expect(secondCard).toHaveTextContent("已发布");
    expect(secondCard).toHaveTextContent("短语");
    expect(secondCard).toHaveTextContent(
      /主词：workspaces · us · 当前发布版本/
    );
    expect(secondCard).toHaveTextContent("有效入站关联：共 3 条");
  });

  it("surface 与 impact 同时存在时在一个确认窗提交终页双 token", async () => {
    const word = wordFixture();
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: true,
      affected: [
        { node_id: "sense-1", node_type: "sense", reason: "词义将被重建" }
      ],
      confirmation_token: "stale-impact-token",
      surface_match_page: surfacePageFixture({
        word,
        surfaceToken: "surface-token-both",
        impactToken: "impact-token-both"
      })
    });
    renderStep(word);

    fireEvent.click(button("保存草稿"));
    expect(
      await screen.findByText("保存前请确认同形提示与下游影响")
    ).toBeInTheDocument();
    expect(screen.getByText("同形词条提示")).toBeInTheDocument();
    expect(screen.getByText("下游内容影响")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    fireEvent.click(button("确认并保存"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed_surface_match_token: "surface-token-both",
        confirmed_impact_token: "impact-token-both"
      })
    );
  });

  it.each([
    { label: "impact-only", withSurface: false },
    { label: "surface+impact", withSurface: true }
  ])(
    "$label 保存返回 downstream_confirmation_required 时重新预览并使用新 token 确认",
    async ({ withSurface }) => {
      const word = wordFixture();
      const impact = (suffix: "old" | "new") => ({
        base_revision: word.revision,
        requires_confirmation: true,
        affected: [
          { node_id: "sense-1", node_type: "sense", reason: "词义将被重建" }
        ],
        ...(withSurface
          ? {
              surface_match_page: surfacePageFixture({
                word,
                snapshotId: `forms-snapshot-${suffix}`,
                matchId: `forms-match-${suffix}`,
                surface: `workspaces-${suffix}`,
                surfaceToken: `surface-token-${suffix}`,
                impactToken: `impact-token-${suffix}`
              })
            }
          : { confirmation_token: `impact-token-${suffix}` })
      });
      mutations.preview
        .mockResolvedValueOnce(impact("old"))
        .mockResolvedValueOnce(impact("new"));
      mutations.save
        .mockRejectedValueOnce(
          new HttpError(
            409,
            "downstream confirmation required",
            [],
            "downstream_confirmation_required"
          )
        )
        .mockResolvedValueOnce({ word: wordFixture({ revision: 4 }) });
      renderStep(word);

      fireEvent.click(button("保存草稿"));
      await waitFor(() => expect(button("确认并保存")).toBeEnabled());
      fireEvent.click(button("确认并保存"));

      await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(button("确认并保存")).toBeEnabled());
      fireEvent.click(button("确认并保存"));

      await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(2));
      expect(mutations.save.mock.calls[1]![0]).toEqual(
        expect.objectContaining({
          confirmed_impact_token: "impact-token-new",
          ...(withSurface
            ? { confirmed_surface_match_token: "surface-token-new" }
            : {})
        })
      );
      expect(screen.queryByText("草稿版本已更新")).toBeNull();
    }
  );

  it("surface 多页读取终页前禁用确认，终页后才允许保存", async () => {
    const word = wordFixture();
    const pendingPage = deferred<SurfaceMatchPageV2>();
    mutations.surfacePage.mockReturnValue(pendingPage.promise);
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: false,
      affected: [],
      surface_match_page: surfacePageFixture({
        word,
        total: 2,
        nextCursor: "cursor-2"
      })
    });
    renderStep(word);

    fireEvent.click(button("保存草稿"));
    expect(
      await screen.findByText("正在加载全部同形命中（1/2）")
    ).toBeInTheDocument();
    expect(button("确认并保存")).toBeDisabled();
    expect(mutations.save).not.toHaveBeenCalled();

    await act(async () =>
      pendingPage.resolve(
        surfacePageFixture({
          word,
          matchId: "forms-match-2",
          existingWordId: "word-workspaces-2",
          total: 2,
          surfaceToken: "surface-token-terminal"
        })
      )
    );
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    fireEvent.click(button("确认并保存"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save.mock.calls[0]![0].confirmed_surface_match_token).toBe(
      "surface-token-terminal"
    );
  });

  it("同形卡可切到候选 POS 并展开候选 slot 所在词形组", async () => {
    const word = wordFixture();
    const targetPos = word.forms.pos[1]!;
    const targetSlot = targetPos.form_groups[0]!.slots[0]!;
    const targetVariant = targetSlot.variants[0]!;
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: false,
      affected: [],
      surface_match_page: surfacePageFixture({ word, posIndex: 1 })
    });
    renderStep(word);

    fireEvent.click(screen.getByRole("tab", { name: /动词/ }));
    const targetGroupToggle = document.querySelector<HTMLButtonElement>(
      `[aria-controls="word-form-group-${targetPos.form_groups[0]!.id}-body"]`
    );
    expect(targetGroupToggle).not.toBeNull();
    fireEvent.click(targetGroupToggle!);
    expect(targetGroupToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("tab", { name: /名词/ }));
    fireEvent.click(button("保存草稿"));
    await screen.findByText("保存前请确认同形提示");
    fireEvent.click(button("定位词形"));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /动词/ })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
    await waitFor(() => {
      expect(targetGroupToggle).toHaveAttribute("aria-expanded", "true");
      expect(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-word-node-id="${targetSlot.id}"]`
          )
        ).some(
          (candidate) =>
            (candidate instanceof HTMLInputElement &&
              candidate.placeholder === "词形拼写") ||
            candidate.querySelector('input[placeholder="词形拼写"]') !== null
        )
      ).toBe(true);
      expect(
        document.querySelector(
          `[data-word-node-id="${targetVariant.id}"] input[placeholder="词形拼写"]`
        )
      ).not.toBeNull();
      expect(document.activeElement).toBe(
        document.querySelector(
          `[data-word-node-id="${targetVariant.id}"] input[placeholder="词形拼写"]`
        )
      );
    });
  });

  it("save 返回 surface_matches_changed 时使用 meta 新首页重新确认", async () => {
    const word = wordFixture();
    const changedPage = surfacePageFixture({
      word,
      snapshotId: "forms-snapshot-changed",
      matchId: "forms-match-changed",
      surface: "workspaces-updated",
      surfaceToken: "surface-token-changed"
    });
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: false,
      affected: [],
      surface_match_page: surfacePageFixture({ word })
    });
    mutations.save
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "surface matches changed",
          [],
          "surface_matches_changed",
          [],
          { surface_match_page: changedPage }
        )
      )
      .mockResolvedValueOnce({ word: wordFixture({ revision: 4 }) });
    renderStep(word);

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    fireEvent.click(button("确认并保存"));
    expect(
      await screen.findByText(
        "workspaces-updated 已在 workspaces-updated 中存在"
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    fireEvent.click(button("确认并保存"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(2));
    expect(mutations.save.mock.calls[1]![0].confirmed_surface_match_token).toBe(
      "surface-token-changed"
    );
    expect(mutations.preview).toHaveBeenCalledTimes(1);
  });

  it.each([
    [410, "surface_match_snapshot_expired"],
    [409, "surface_policy_changed"]
  ] as const)(
    "%s/%s 后重新执行 impact 并要求使用新 token 再确认",
    async (status, code) => {
      const word = wordFixture();
      mutations.preview
        .mockResolvedValueOnce({
          base_revision: word.revision,
          requires_confirmation: false,
          affected: [],
          surface_match_page: surfacePageFixture({ word })
        })
        .mockResolvedValueOnce({
          base_revision: word.revision,
          requires_confirmation: false,
          affected: [],
          surface_match_page: surfacePageFixture({
            word,
            snapshotId: `forms-snapshot-${code}`,
            matchId: `forms-match-${code}`,
            surface: `workspaces-${code}`,
            surfaceToken: `surface-token-${code}`
          })
        });
      mutations.save
        .mockRejectedValueOnce(new HttpError(status, code, [], code))
        .mockResolvedValueOnce({ word: wordFixture({ revision: 4 }) });
      renderStep(word);

      fireEvent.click(button("保存草稿"));
      await waitFor(() => expect(button("确认并保存")).toBeEnabled());
      fireEvent.click(button("确认并保存"));

      await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByText(
          `workspaces-${code} 已在 workspaces-${code} 中存在`
        )
      ).toBeInTheDocument();
      await waitFor(() => expect(button("确认并保存")).toBeEnabled());
      fireEvent.click(button("确认并保存"));

      await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(2));
      expect(
        mutations.save.mock.calls[1]![0].confirmed_surface_match_token
      ).toBe(`surface-token-${code}`);
    }
  );

  it("普通 409 保持草稿版本冲突行为，不进入 surface 重确认", async () => {
    mutations.save.mockRejectedValue(
      new HttpError(409, "revision conflict", [], "revision_conflict")
    );
    renderStep();

    fireEvent.click(button("保存草稿"));

    expect(
      (await screen.findAllByText("草稿版本已更新")).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("同形词条提示")).toBeNull();
    expect(mutations.preview).toHaveBeenCalledTimes(1);
  });

  it("影响预览返回 revision_conflict 时复用草稿版本冲突流程", async () => {
    mutations.preview.mockRejectedValue(
      new HttpError(409, "revision conflict", [], "revision_conflict")
    );
    renderStep();

    fireEvent.click(button("保存草稿"));

    expect(
      (await screen.findAllByText("草稿版本已更新")).length
    ).toBeGreaterThan(0);
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("影响预览返回 Forms field issue 时展示并定位稳定 node/field", async () => {
    const issue = {
      step: "forms" as const,
      node_id: "suggested-verb-slot-1",
      field: "variants.uk.spelling",
      code: "required",
      message: "请补齐英式词形"
    };
    mutations.preview.mockRejectedValue(
      new HttpError(422, "invalid forms", [], "validation_failed", [issue])
    );
    const { router } = renderStep();

    fireEvent.click(button("保存草稿"));

    await waitFor(() =>
      expect(router.state.location.state).toEqual({
        nodeId: issue.node_id,
        field: issue.field
      })
    );
    expect((await screen.findAllByText(issue.message)).length).toBeGreaterThan(
      0
    );
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("重复点击确认仍只保存一次并只回传一次成功 revision", async () => {
    const word = wordFixture();
    const pending = deferred<{ word: ReturnType<typeof wordFixture> }>();
    mutations.preview.mockResolvedValue({
      base_revision: word.revision,
      requires_confirmation: false,
      affected: [],
      surface_match_page: surfacePageFixture({ word })
    });
    mutations.save.mockReturnValue(pending.promise);
    const { onSaved } = renderStep(word);

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(button("确认并保存")).toBeEnabled());
    const confirm = button("确认并保存");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mutations.save).toHaveBeenCalledTimes(1);

    const saved = wordFixture({ revision: word.revision + 1 });
    await act(async () => pending.resolve({ word: saved }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it("取消影响确认时不保存", async () => {
    mutations.preview.mockResolvedValue({
      base_revision: 3,
      requires_confirmation: true,
      affected: [
        { node_id: "sense-1", node_type: "sense", reason: "词义将被重建" }
      ],
      confirmation_token: "impact-token-cancel"
    });
    const { onSaved } = renderStep();
    const input = screen.getAllByLabelText("实际发音")[0]!;
    fireEvent.change(input, { target: { value: "cancel-keeps-this" } });

    fireEvent.click(button("保存草稿"));
    await screen.findByText(/共影响/);
    let cancel: HTMLButtonElement | null = null;
    await waitFor(() => {
      cancel = document.querySelector<HTMLButtonElement>(
        ".ant-modal-footer .ant-btn-default"
      );
      expect(cancel).not.toBeNull();
    });
    await waitFor(() => expect(cancel).toBeEnabled());
    fireEvent.click(cancel!);

    await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(1));
    expect(mutations.save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(input).toHaveValue("cancel-keeps-this");
  });

  it("长影响列表按原因和节点类型聚合展示且不泄露节点 ID", async () => {
    mutations.preview.mockResolvedValue({
      base_revision: 3,
      requires_confirmation: true,
      affected: [
        ...Array.from({ length: 12 }, (_, index) => ({
          node_id: `sense-secret-${index}`,
          node_type: "sense" as const,
          reason: "相关内容需要复核"
        })),
        ...Array.from({ length: 8 }, (_, index) => ({
          node_id: `sentence-secret-${index}`,
          node_type: "sentence" as const,
          reason: "相关内容需要复核"
        }))
      ],
      confirmation_token: "impact-token-long"
    });
    renderStep();

    fireEvent.click(button("保存草稿"));

    expect(await screen.findByText(/共影响/)).toHaveTextContent("20");
    expect(screen.getByText("类型：词义 12、例句 8")).toBeInTheDocument();
    expect(
      screen.getByText("相关内容需要复核（20 个：词义 12、例句 8）")
    ).toBeInTheDocument();
    expect(screen.queryByText(/sense-secret/)).toBeNull();
  });

  it("服务端 field issue 切换所属词性并聚焦稳定 node/field", async () => {
    const issue = {
      step: "forms" as const,
      node_id: "suggested-verb-slot-1",
      field: "variants.uk.spelling",
      code: "required",
      message: "请补齐英式词形"
    };
    mutations.save.mockRejectedValue(
      new HttpError(422, "invalid forms", [], undefined, [issue])
    );
    const { router } = renderStep();

    fireEvent.click(button("保存草稿"));

    await waitFor(() =>
      expect(router.state.location.state).toEqual({
        nodeId: issue.node_id,
        field: issue.field
      })
    );
    await waitFor(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-word-node-id="${issue.node_id}"][data-word-field="${issue.field}"]`
      );
      expect(target).not.toBeNull();
      expect(target).toHaveClass("word-validation-focus");
      expect(document.activeElement).toBe(target);
    });

    const focused = document.querySelector<HTMLElement>(
      `[data-word-node-id="${issue.node_id}"][data-word-field="${issue.field}"]`
    )!;
    const spellingInput =
      focused instanceof HTMLInputElement
        ? focused
        : focused.querySelector<HTMLInputElement>(
            'input[placeholder="词形拼写"]'
          )!;
    expect(document.querySelector(".ant-alert-error")).not.toBeNull();
    fireEvent.change(spellingInput, { target: { value: "updated-form" } });
    expect(document.querySelector(".ant-alert-error")).toBeNull();
  });

  it("readiness 读音目标聚焦到真实的首个无效叶字段", async () => {
    const word = wordFixture({ ready: true });
    const pronunciation =
      word.forms.pos[0]!.base_form.variants[0]!.pronunciations[0]!;
    pronunciation.dict_phonetic = "";

    renderStep(word, {
      nodeId: pronunciation.id,
      field: "dict_phonetic"
    });

    await waitFor(() => {
      const target = document.querySelector<HTMLInputElement>(
        `[data-word-node-id="${pronunciation.id}"][data-word-field="dict_phonetic"]`
      );
      expect(target).not.toBeNull();
      expect(target).toHaveClass("word-validation-focus");
      expect(document.activeElement).toBe(target);
    });
  });

  it("校验定位后手动切换词性，输入时不再跳回原词性", async () => {
    renderStep(undefined, {
      nodeId: "suggested-base-noun",
      field: "variants.uk.spelling"
    });

    const nounTab = screen.getByRole("tab", { name: /名词/ });
    const verbTab = screen.getByRole("tab", { name: /动词/ });
    await waitFor(() =>
      expect(nounTab).toHaveAttribute("aria-selected", "true")
    );

    fireEvent.click(verbTab);
    expect(verbTab).toHaveAttribute("aria-selected", "true");

    const visiblePhonetic = screen
      .getAllByLabelText("字典音标")
      .find((input) => input.closest("[aria-hidden='true']") === null);
    expect(visiblePhonetic).toBeDefined();
    fireEvent.change(visiblePhonetic!, { target: { value: "changed" } });

    expect(verbTab).toHaveAttribute("aria-selected", "true");
  });

  it("可组合编辑读音和已有派生词形，并保存变更", async () => {
    renderStep();

    const phoneticInput = screen.getAllByLabelText("字典音标")[0]!;
    const compactGroup = phoneticInput.closest(".ant-space-compact");
    expect(compactGroup).not.toBeNull();
    expect(compactGroup?.children).toHaveLength(3);
    const [playAction, input, voiceAction] = Array.from(compactGroup!.children);
    expect(playAction).toBeDefined();
    expect(input).toBeDefined();
    expect(voiceAction).toBeDefined();
    expect(playAction!.className).toContain("compact-first-item");
    expect(playAction!.className).not.toContain("compact-last-item");
    expect(input!.className).not.toContain("compact-first-item");
    expect(input!.className).not.toContain("compact-last-item");
    expect(voiceAction!.className).toContain("compact-last-item");
    expect(voiceAction!.className).not.toContain("compact-first-item");

    fireEvent.change(phoneticInput, {
      target: { value: "/changed/" }
    });
    const editableSpelling = screen
      .getAllByLabelText("英式词形拼写")
      .find((input) => !(input as HTMLInputElement).readOnly);
    expect(editableSpelling).toBeDefined();
    fireEvent.change(editableSpelling!, {
      target: { value: "centres-edited" }
    });

    const addPronunciation = screen
      .getAllByLabelText("添加读音")
      .find((item) => !(item as HTMLButtonElement).disabled);
    expect(addPronunciation).toBeDefined();
    fireEvent.click(addPronunciation!);
    await waitFor(() =>
      expect(screen.getAllByLabelText("删除读音").length).toBeGreaterThan(0)
    );
    const removePronunciation = screen
      .getAllByLabelText("删除读音")
      .find((item) => !(item as HTMLButtonElement).disabled);
    expect(removePronunciation).toBeDefined();
    fireEvent.click(removePronunciation!);

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedPos = mutations.save.mock.calls[0]![0].content.pos[0];
    expect(savedPos.base_form.variants[0].pronunciations).toHaveLength(1);
    expect(savedPos.form_groups).toHaveLength(1);
  });

  it("统一主词下的已发布内容只读展示，不暴露编辑操作", () => {
    const word = wordFixture({
      headword: "far",
      ready: true,
      status: "published"
    });
    renderStep(word, undefined, true);

    expect(screen.getAllByLabelText("共用词形拼写").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("实际发音")[0]).toHaveAttribute("readonly");
    expect(screen.queryByText("添加派生词形")).toBeNull();
    expect(screen.queryByText("保存草稿")).toBeNull();
  });

  it("拼写相同但音标不同时只显示一个词形块，并在块内区分英美发音", async () => {
    renderStep(wordFixture({ headword: "far", ready: true }));
    expect(screen.queryByLabelText("英式词形拼写")).toBeNull();
    expect(screen.queryByLabelText("美式词形拼写")).toBeNull();
    expect(screen.getAllByLabelText("共用词形拼写")[0]).toHaveValue("far");
    expect(screen.getAllByText("英式 · BrE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("美式 · AmE").length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('[data-spelling-layout="unified"]').length
    ).toBeGreaterThan(0);

    const phoneticBlock = screen
      .getByText("英美音标是否有区别？")
      .closest("div")!;
    const phoneticNo = Array.from(
      phoneticBlock.querySelectorAll<HTMLLabelElement>(
        "label.ant-radio-wrapper"
      )
    ).find((label) => label.textContent?.trim() === "否");
    expect(phoneticNo).toBeDefined();
    fireEvent.click(phoneticNo!);
    await waitFor(() =>
      expect(screen.getAllByLabelText("共用词形拼写").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText("英美共用").length).toBeGreaterThan(0);

    const spellingBlock = screen
      .getByText("英美拼写是否有区别？")
      .closest("div")!;
    const spellingYes = Array.from(
      spellingBlock.querySelectorAll<HTMLLabelElement>(
        "label.ant-radio-wrapper"
      )
    ).find((label) => label.textContent?.trim() === "是");
    expect(spellingYes).toBeDefined();
    fireEvent.click(spellingYes!);
    await waitFor(() =>
      expect(screen.getAllByLabelText("美式词形拼写").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByLabelText("英式词形拼写")[0]).toHaveValue("far");
    expect(screen.getAllByLabelText("美式词形拼写")[0]).toHaveValue("far");
    expect(screen.queryByText("英美音标是否有区别？")).toBeNull();
  });

  it("拼写统一但音标区分的完整词形可以完成", async () => {
    renderStep(wordFixture({ headword: "far", ready: true }));

    fireEvent.click(button("完成并进入词义与例句"));

    await waitFor(() => expect(mutations.preview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/基准原形缺少/)).toBeNull();
    expect(screen.queryByText(/派生词形尚未填写完整/)).toBeNull();
  });

  it("名词和动词拼写区分时隐藏音标区别选项并保持英美两栏", () => {
    renderStep(wordFixture({ headword: "center", ready: true }));

    expect(screen.queryByText("英美音标是否有区别？")).toBeNull();
    expect(screen.getAllByLabelText("英式词形拼写")[0]).toHaveValue("centre");
    expect(screen.getAllByLabelText("美式词形拼写")[0]).toHaveValue("center");
    expect(screen.queryByLabelText("共用词形拼写")).toBeNull();
    expect(
      document.querySelectorAll('[data-spelling-layout="distinguish"]').length
    ).toBeGreaterThan(1);

    fireEvent.click(screen.getByText("动词", { exact: true }));
    expect(screen.queryByText("英美音标是否有区别？")).toBeNull();
    expect(screen.getAllByLabelText("英式词形拼写")[0]).toHaveValue("centre");
    expect(screen.getAllByLabelText("美式词形拼写")[0]).toHaveValue("center");
  });

  it("加载 distinguish 转 unified 的后端草稿时归一化全部词形并可完成 Step 2", async () => {
    const values = new Map<string, string>();
    const mock = createAdminWordsMock({
      getAdminProfile: () => ({
        id: "admin-test",
        phone: "13800000000",
        display_name: "Mock Admin",
        role: "admin",
        permissions: ["words.access"]
      }),
      now: () => new Date("2026-08-02T03:00:00.000Z"),
      sessionStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key)
      }
    });
    const detection = await mock.detect({ language: "en", headword: "center" });
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("center fixture must match");
    }
    const created = await mock.createV2({
      schema_version: 2,
      idempotency_key: "component-distinguish-to-unified",
      detection_id: detection.detection_id,
      headwords: { mode: "unified", common: "center" }
    });

    renderStep(created.word);
    expect(screen.queryByLabelText("英式词形拼写")).toBeNull();
    expect(screen.queryByLabelText("美式词形拼写")).toBeNull();

    const completeVisibleBasePronunciations = () => {
      for (const input of screen
        .getAllByLabelText("字典音标")
        .filter((item) => (item as HTMLInputElement).value === "")) {
        fireEvent.change(input, { target: { value: "mock" } });
      }
      for (const input of screen
        .getAllByLabelText("实际发音")
        .filter((item) => (item as HTMLInputElement).value === "")) {
        fireEvent.change(input, { target: { value: "mock" } });
      }
    };
    completeVisibleBasePronunciations();
    fireEvent.click(screen.getByText("动词", { exact: true }));
    completeVisibleBasePronunciations();
    fireEvent.click(button("完成并进入词义与例句"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const input = mutations.save.mock.calls[0]![0] as {
      intent: string;
      content: DraftFormsStepContent;
    };
    expect(input.intent).toBe("complete");
    for (const pos of input.content.pos) {
      for (const slot of [
        pos.base_form,
        ...pos.form_groups.flatMap((group) => group.slots)
      ]) {
        expect(slot.variants.map((variant) => variant.dialect)).toEqual([
          "common"
        ]);
      }
    }
    expect(
      input.content.pos[0]?.form_groups[0]?.slots[0]?.variants[0]?.spelling
    ).toBe("centers");
    await expect(
      mock.saveFormsStep(created.word.id, {
        base_revision: created.word.revision,
        operation_id: "component-complete-normalized-forms",
        intent: "complete",
        content: input.content
      })
    ).resolves.toMatchObject({
      word: { completed_steps: ["basics", "forms"] }
    });
  });

  it("空词性列表完成时在客户端阻断", async () => {
    const word = wordFixture();
    word.forms.pos = [];
    renderStep(word);
    fireEvent.click(button("完成并进入词义与例句"));
    expect(
      await screen.findByText("请至少保留一个基本词性")
    ).toBeInTheDocument();
    expect(mutations.preview).not.toHaveBeenCalled();
  });

  it("影响确认响应没有 token 时提示异常并阻止保存", async () => {
    mutations.preview.mockResolvedValue({
      base_revision: 3,
      requires_confirmation: true,
      affected: [
        { node_id: "sense-1", node_type: "sense", reason: "会清理词义" }
      ]
    });
    renderStep();
    fireEvent.click(button("保存草稿"));
    expect(
      await screen.findByText("影响预览响应异常，缺少确认凭证，已阻止保存")
    ).toBeInTheDocument();
    expect(screen.queryByText("本次修改会影响后续内容")).toBeNull();
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("影响确认响应 affected 为空时提示异常并阻止保存", async () => {
    mutations.preview.mockResolvedValue({
      base_revision: 3,
      requires_confirmation: true,
      affected: [],
      confirmation_token: "impact-token-empty"
    });
    renderStep();
    fireEvent.click(button("保存草稿"));
    expect(
      await screen.findByText("影响预览响应异常，未返回受影响节点，已阻止保存")
    ).toBeInTheDocument();
    expect(mutations.save).not.toHaveBeenCalled();
  });
});
