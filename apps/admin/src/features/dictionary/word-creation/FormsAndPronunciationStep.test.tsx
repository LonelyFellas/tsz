import { HttpError } from "@tsz/api-client/http";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormsAndPronunciationStep } from "./FormsAndPronunciationStep";
import { deferred, wordFixture } from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  preview: vi.fn(),
  save: vi.fn(),
  suggest: vi.fn()
}));
const dataSourceCapabilities = vi.hoisted(() => ({
  dialectVariantSuggestions: true
}));
vi.mock("../dataSource", () => ({
  adminWordsDataSourceCapabilities: dataSourceCapabilities
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

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogQueryResult } =
    await import("./partOfSpeech.test.helper");
  return { usePartOfSpeechCatalog: partOfSpeechCatalogQueryResult };
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
  const router = createMemoryRouter(
    [
      {
        path: "/words/:wordId/wizard/forms",
        element: (
          <>
            <FormsAndPronunciationStep
              word={word}
              readOnly={readOnly}
              onSaved={onSaved}
            />
            <LocationProbe />
          </>
        )
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
  return { onSaved, router };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(screen.getAllByLabelText("上传语音").length).toBeGreaterThan(0);
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

  it("编辑后完成保存并放行到 meanings，提交 revision、operation 与完整 content", async () => {
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
        operation_id: expect.any(String),
        intent: "complete",
        confirmed_impact_token: null,
        content: expect.objectContaining({ pos: expect.any(Array) })
      })
    );
    const payload = mutations.save.mock.calls[0]![0];
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
      await screen.findByText("请完善各词性基准原形的字典音标和实际发音")
    ).toBeInTheDocument();
    expect(mutations.preview).not.toHaveBeenCalled();
    expect(mutations.save).not.toHaveBeenCalled();
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
  });

  it("可组合编辑读音和已有派生词形，并保存变更", async () => {
    renderStep();

    fireEvent.change(screen.getAllByLabelText("字典音标")[0]!, {
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

  it("影响确认响应没有 token 时显式以 null 保存", async () => {
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
      (await screen.findAllByText("本次修改会影响后续内容")).length
    ).toBeGreaterThan(0);
    fireEvent.click(button("确认并保存"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed_impact_token: null })
    );
  });
});
