import { HttpError } from "@tsz/api-client/http";
import type { SurfaceMatchPageV2 } from "@tsz/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewAndPublishStep } from "./PreviewAndPublishStep";
import { deferred, wordFixture } from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  validate: vi.fn(),
  publish: vi.fn()
}));

vi.mock("./api", () => ({
  useValidateWordV2: () => ({
    mutateAsync: mutations.validate,
    isPending: false
  }),
  usePublishWordV2: () => ({
    mutateAsync: mutations.publish,
    isPending: false
  })
}));

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogQueryResult } =
    await import("./partOfSpeech.test.helper");
  return { usePartOfSpeechCatalog: partOfSpeechCatalogQueryResult };
});

function button(label: string): HTMLButtonElement {
  const result = screen
    .getAllByRole("button")
    .find((item) => item.textContent?.replaceAll(/\s/g, "") === label);
  if (!result) throw new Error(`button not found: ${label}`);
  return result as HTMLButtonElement;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}|{JSON.stringify(location.state)}
    </span>
  );
}

function renderStep(word = wordFixture({ ready: true }), readOnly?: boolean) {
  const onPublished = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/words/${word.id}/wizard/preview`]}>
      <AntApp>
        <PreviewAndPublishStep
          word={word}
          readOnly={readOnly}
          onPublished={onPublished}
        />
        <LocationProbe />
      </AntApp>
    </MemoryRouter>
  );
  return { onPublished, word };
}

function visibilityPage(
  continuation: "enabled" | "disabled",
  reasons: Array<"visibility_activation" | "unacknowledged_surface_matches"> = [
    "visibility_activation"
  ]
): SurfaceMatchPageV2 {
  const memberships: Array<
    Array<"visibility_activation" | "unacknowledged_surface_matches">
  > =
    reasons.length === 2
      ? [
          ["visibility_activation"],
          ["unacknowledged_surface_matches"],
          ["visibility_activation", "unacknowledged_surface_matches"]
        ]
      : [reasons];
  const items = memberships.map((membership, index) => ({
    match_id: `visibility-${index}`,
    match_category: "exact_headword" as const,
    severity: "warning" as const,
    attention_level: "high" as const,
    can_continue: true as const,
    confirmation_reasons: membership,
    candidate: {
      candidate_type: "headword" as const,
      candidate_ref: "headword:common",
      candidate_word_id: "019b0000-0000-7000-8000-000000000001",
      surface: "workspace",
      normalized_surface: "workspace",
      dialect: "common" as const,
      entry_kind: "word" as const
    },
    existing: {
      word_id: `019b0000-0000-7000-8000-${String(99 + index).padStart(12, "0")}`,
      headword: "workspace",
      kind: "word" as const,
      status: "published" as const,
      source: {
        source_kind: "headword" as const,
        source_id: `source-${index}`,
        content_scope: "current_publication" as const,
        surface: "workspace",
        dialect: "common" as const
      }
    }
  }));
  const base = {
    snapshot_id: "019b0000-0000-7000-8000-000000000010",
    items,
    total: items.length,
    matched_entry_contexts: items.map((item) => ({
      word_id: item.existing.word_id,
      pos_labels: ["noun"],
      gloss_previews: ["工作空间"],
      updated_at: "2026-08-16T00:00:00Z",
      inbound_relations: {
        total: 0,
        by_type: { synonym: 0, antonym: 0, derivative: 0 },
        previews: [],
        truncated: false
      }
    })),
    confirmation_reasons: reasons,
    policy_name: "allow_multiple_active_exact_headword_publications" as const,
    policy_epoch: 3
  };
  return continuation === "enabled"
    ? {
        ...base,
        continuation_policy: "enabled",
        next_cursor: null,
        surface_confirmation_token: "visibility-command-token"
      }
    : {
        ...base,
        continuation_policy: "temporarily_disabled",
        next_cursor: null,
        policy_block_code:
          "multiple_active_exact_headword_publications_not_enabled"
      };
}

beforeEach(() => {
  mutations.validate.mockReset();
  mutations.publish.mockReset();
  vi.clearAllMocks();
});

describe("PreviewAndPublishStep", () => {
  it("如实说明是结构化核对，并按偏好侧优先展示主词", async () => {
    const word = wordFixture({ ready: true });
    mutations.validate.mockResolvedValue({
      validated_revision: word.revision,
      valid: true,
      issues: []
    });
    renderStep(word);

    expect(
      await screen.findByText(
        "逐项核对结构化内容与发布完整性校验结果；本页不呈现学习端字典卡片样式。所有问题处理完成后可直接提交生效。"
      )
    ).toBeInTheDocument();
    // 主词顺序按方言偏好(缺省英式)，与左栏「当前词条」一致。
    expect(screen.getByText("centre / center")).toBeInTheDocument();
  });

  it("自动校验失败时列出可定位 issue，并禁止发布", async () => {
    const word = wordFixture({ ready: true, revision: 7 });
    mutations.validate.mockResolvedValue({
      validated_revision: 7,
      valid: false,
      issues: [
        {
          step: "meanings",
          node_id: "sense-1",
          field: "definitions",
          code: "native_definition_required",
          message: "至少填写一条中文释义"
        }
      ]
    });
    renderStep(word);

    await waitFor(() =>
      expect(mutations.validate).toHaveBeenCalledWith({ base_revision: 7 })
    );
    expect(await screen.findByText("发现 1 个待处理问题")).toBeVisible();
    expect(screen.getByText("词义与例句 · 至少填写一条中文释义")).toBeVisible();
    expect(button("提交生效")).toBeDisabled();

    fireEvent.click(button("去处理"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${word.id}/wizard/meanings`
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      '"nodeId":"sense-1"'
    );
    expect(mutations.publish).not.toHaveBeenCalled();
  });

  it("尚未录入的新草稿越步进入预览时安全降级，并由完整性检查拦住发布", async () => {
    // 步骤顺序门禁取消后，第 4 步在草稿刚创建时就点得进来。
    const word = wordFixture({ revision: 2 });
    mutations.validate.mockResolvedValue({
      validated_revision: 2,
      valid: false,
      issues: [
        {
          step: "forms",
          node_id: word.forms.pos[0]!.base_form.id,
          field: "actual_pron",
          code: "actual_pron_required",
          message: "请补齐原形实际发音"
        }
      ]
    });
    renderStep(word);

    expect(await screen.findByText("发现 1 个待处理问题")).toBeVisible();
    expect(screen.getByText("词形与发音 · 请补齐原形实际发音")).toBeVisible();
    expect(button("提交生效")).toBeDisabled();
  });

  it("同 revision 校验通过后发布，回写 published word 并返回列表", async () => {
    const word = wordFixture({ ready: true, revision: 8 });
    const published = wordFixture({
      ready: true,
      status: "published",
      revision: 9
    });
    mutations.validate.mockResolvedValue({
      validated_revision: 8,
      valid: true,
      issues: []
    });
    mutations.publish.mockResolvedValue({ word: published });
    const { onPublished } = renderStep(word);

    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    fireEvent.click(button("提交生效"));

    await waitFor(() =>
      expect(mutations.publish).toHaveBeenCalledWith({
        base_revision: 8,
        idempotency_key: expect.any(String)
      })
    );
    expect(mutations.validate).toHaveBeenCalledTimes(1);
    expect(onPublished).toHaveBeenCalledWith(published);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/words\|/)
    );
  });

  it("连续双击提交只发起一次发布请求", async () => {
    const word = wordFixture({ ready: true, revision: 8 });
    const published = wordFixture({
      ready: true,
      status: "published",
      revision: 9
    });
    const pendingPublish = deferred<{ word: typeof published }>();
    mutations.validate.mockResolvedValue({
      validated_revision: 8,
      valid: true,
      issues: []
    });
    mutations.publish.mockReturnValue(pendingPublish.promise);
    renderStep(word);

    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    const submit = button("提交生效");
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mutations.publish).toHaveBeenCalledTimes(1);
    pendingPublish.resolve({ word: published });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/words\|/)
    );
  });

  it("gate-off 的 1→2 显示稳定能力提示且普通 token 不能继续发布", async () => {
    const word = wordFixture({ ready: true, revision: 8 });
    mutations.validate.mockResolvedValue({
      validated_revision: 8,
      valid: true,
      issues: []
    });
    mutations.publish.mockRejectedValue(
      new HttpError(
        409,
        "disabled",
        [],
        "multiple_active_exact_headword_publications_not_enabled",
        [],
        { surface_match_page: visibilityPage("disabled") }
      )
    );
    renderStep(word);
    fireEvent.click(await screen.findByText("提交生效"));

    expect(
      await screen.findByText("学习端暂不支持多个同名公开词条")
    ).toBeVisible();
    expect(screen.getByText(/普通同形 warning token 不能绕过/)).toBeVisible();
    expect(button("提交生效")).toBeDisabled();
    expect(mutations.publish).toHaveBeenCalledTimes(1);
  });

  it("composite 单 token 分组展示并用新 Idempotency-Key 重试", async () => {
    const word = wordFixture({ ready: true, revision: 8 });
    const published = wordFixture({
      ready: true,
      status: "published",
      revision: 8
    });
    mutations.validate.mockResolvedValue({
      validated_revision: 8,
      valid: true,
      issues: []
    });
    mutations.publish
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "confirmation required",
          [],
          "surface_match_acknowledgement_required",
          [],
          {
            surface_match_page: visibilityPage("enabled", [
              "visibility_activation",
              "unacknowledged_surface_matches"
            ])
          }
        )
      )
      .mockResolvedValueOnce({ word: published });
    renderStep(word);
    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    fireEvent.click(button("提交生效"));

    expect(await screen.findByText("公开可见性 + 普通同形提示")).toBeVisible();
    expect(screen.getByText("仅公开可见性")).toBeVisible();
    expect(screen.getByText("仅普通同形提示")).toBeVisible();
    const firstKey = mutations.publish.mock.calls[0]![0].idempotency_key;
    fireEvent.click(button("确认同名公开范围并提交生效"));

    await waitFor(() => expect(mutations.publish).toHaveBeenCalledTimes(2));
    expect(mutations.publish.mock.calls[1]![0]).toMatchObject({
      base_revision: 8,
      confirmed_surface_match_token: "visibility-command-token"
    });
    expect(mutations.publish.mock.calls[1]![0].idempotency_key).not.toBe(
      firstKey
    );
  });

  it("传输结果未知时保留同一 Idempotency-Key，显式业务 410 后才轮换", async () => {
    const word = wordFixture({ ready: true, revision: 8 });
    const published = wordFixture({
      ready: true,
      status: "published",
      revision: 8
    });
    mutations.validate.mockResolvedValue({
      validated_revision: 8,
      valid: true,
      issues: []
    });
    mutations.publish
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockRejectedValueOnce(
        new HttpError(410, "expired", [], "surface_match_snapshot_expired")
      )
      .mockResolvedValueOnce({ word: published });
    renderStep(word);
    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    fireEvent.click(button("提交生效"));
    expect(
      await screen.findByText("network result unknown")
    ).toBeInTheDocument();
    const firstKey = mutations.publish.mock.calls[0]![0].idempotency_key;

    fireEvent.click(button("提交生效"));
    await waitFor(() => expect(mutations.publish).toHaveBeenCalledTimes(2));
    expect(mutations.publish.mock.calls[1]![0].idempotency_key).toBe(firstKey);
    expect(
      await screen.findByText("公开确认已过期，请重新发布并确认最新结果")
    ).toBeInTheDocument();
    fireEvent.click(button("提交生效"));
    await waitFor(() => expect(mutations.publish).toHaveBeenCalledTimes(3));
    expect(mutations.publish.mock.calls[2]![0].idempotency_key).not.toBe(
      firstKey
    );
  });

  it("首次校验发生网络错误时显示失败态和可访问的重试入口", async () => {
    const word = wordFixture({ ready: true, revision: 5 });
    mutations.validate.mockRejectedValue(new Error("validation offline"));
    renderStep(word);

    expect(await screen.findByText("完整性检查失败")).toBeVisible();
    expect(await screen.findByText("validation offline")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新检查发布完整性" })
    ).toBeVisible();
    expect(button("提交生效")).toBeDisabled();
    expect(mutations.publish).not.toHaveBeenCalled();
  });

  it("校验失败后可重新检查，成功时清除错误并恢复发布", async () => {
    const word = wordFixture({ ready: true, revision: 6 });
    mutations.validate
      .mockRejectedValueOnce(new Error("validation offline"))
      .mockResolvedValueOnce({
        validated_revision: 6,
        valid: true,
        issues: []
      });
    renderStep(word);

    expect(await screen.findByText("完整性检查失败")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重新检查发布完整性" }));

    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    expect(screen.queryByText("validation offline")).toBeNull();
    expect(mutations.validate).toHaveBeenCalledTimes(2);
    expect(button("提交生效")).toBeEnabled();
  });

  it("发布失败显示错误且不离开当前预览", async () => {
    const word = wordFixture({ ready: true, revision: 5 });
    mutations.validate.mockResolvedValue({
      validated_revision: 5,
      valid: true,
      issues: []
    });
    mutations.publish.mockRejectedValue(new Error("publish conflict"));
    renderStep(word);
    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    fireEvent.click(button("提交生效"));
    expect(await screen.findByText("publish conflict")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${word.id}/wizard/preview`
    );
  });

  it("validate 返回字段级问题时直接展示可定位问题", async () => {
    const issue = {
      step: "forms" as const,
      node_id: "form-1",
      field: "spelling",
      code: "required",
      message: "请填写词形"
    };
    mutations.validate.mockRejectedValue(
      new HttpError(422, "invalid draft", [], "validation_failed", [issue])
    );
    renderStep();

    expect(await screen.findByText("发现 1 个待处理问题")).toBeVisible();
    expect(screen.getByText("词形与发音 · 请填写词形")).toBeVisible();
    expect(button("提交生效")).toBeDisabled();
  });

  it("validate revision 冲突时提示重新加载并保留失败态", async () => {
    mutations.validate.mockRejectedValue(
      new HttpError(409, "word revision conflict", [], "revision_conflict")
    );
    renderStep();

    expect(
      (await screen.findAllByText("草稿版本已更新")).length
    ).toBeGreaterThan(0);
    expect(await screen.findByText("word revision conflict")).toBeVisible();
  });

  it("缓存校验 revision 过旧时提交前重新校验", async () => {
    const word = wordFixture({ ready: true, revision: 8 });
    const published = wordFixture({
      ready: true,
      status: "published",
      revision: 9
    });
    mutations.validate
      .mockResolvedValueOnce({ validated_revision: 7, valid: true, issues: [] })
      .mockResolvedValueOnce({
        validated_revision: 8,
        valid: true,
        issues: []
      });
    mutations.publish.mockResolvedValue({ word: published });
    renderStep(word);

    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    fireEvent.click(button("提交生效"));

    await waitFor(() => expect(mutations.validate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mutations.publish).toHaveBeenCalledTimes(1));
  });

  it("只读预览对空值、未知词性、空词形组与关系词安全降级", () => {
    const published = wordFixture({ status: "published", ready: true });
    published.published_at = undefined;
    const formPos = published.forms.pos[0]!;
    formPos.base_form.variants[0]!.spelling = "";
    formPos.base_form.variants[0]!.pronunciations[0]!.dict_phonetic = "";
    formPos.base_form.variants[0]!.pronunciations[0]!.actual_pron = "";
    formPos.form_groups[0]!.slots = [];
    const meaningPos = published.meanings.pos[0]!;
    meaningPos.pos_id = "unknown-pos";
    meaningPos.grammar_structures[0]!.variants[0]!.content.text = "";
    const sense = meaningPos.senses[0]!;
    sense.frequency = undefined;
    sense.depends_on_context = true;
    sense.definitions[0]!.content = {
      version: 1,
      text: "",
      spans: [],
      liaisons: []
    };
    sense.definitions.push({
      id: "definition-en",
      level: "A1",
      definition_mode: "en_definition",
      content: structuredClone(sense.sentences[0]!.en_text)
    });
    sense.sentences[0]!.zh_text.text = "";
    sense.relations.push({
      id: "relation-1",
      relation: "synonym",
      target_word_id: "",
      target_sense_id: "",
      score: "0"
    });

    renderStep(published);
    const previews = Array.from(
      document.querySelectorAll<HTMLElement>(".ant-collapse-header")
    );
    previews.forEach((header) => fireEvent.click(header));

    expect(screen.getByText("发布于 —")).toBeVisible();
    expect(screen.getAllByText("未填写").length).toBeGreaterThan(0);
    expect(screen.getByText("未知词性")).toBeVisible();
    expect(screen.getByText("没有派生词形")).toBeInTheDocument();
    expect(screen.getByText(/synonym/)).toBeInTheDocument();
    // 释义方式展示中文标签，不把 wire 码 zh_definition/en_definition 暴露给录入者。
    expect(screen.getAllByText("中文定义释义").length).toBeGreaterThan(0);
    expect(screen.getByText("英文定义释义")).toBeInTheDocument();
    expect(screen.queryByText("zh_definition")).toBeNull();
    expect(screen.queryByText("en_definition")).toBeNull();
  });

  it("published 只读详情不重复 validate，展示发布时间并允许继续编辑", () => {
    const published = wordFixture({
      headword: "far",
      status: "published",
      ready: true
    });
    renderStep(published);

    expect(screen.getByText("词条详情")).toBeVisible();
    expect(screen.getByText("词条已发布")).toBeVisible();
    expect(screen.getByText(/发布于 2026-08-02 11:10/)).toBeVisible();
    expect(mutations.validate).not.toHaveBeenCalled();
    expect(screen.queryByText("提交生效")).toBeNull();

    const previews = Array.from(
      document.querySelectorAll<HTMLElement>(".ant-collapse-header")
    );
    expect(previews.length).toBeGreaterThanOrEqual(2);
    previews.forEach((header) => fireEvent.click(header));
    expect(screen.getAllByText("共享原形").length).toBeGreaterThan(0);
    expect(screen.getAllByText("语法结构").length).toBeGreaterThan(0);

    fireEvent.click(button("继续编辑"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${published.id}/wizard/forms?mode=edit`
    );
  });

  it("archived 预览明确显示归档只读态，且不提供继续编辑或发布", () => {
    const archived = wordFixture({
      status: "archived",
      ready: true,
      max_reachable_step: "preview"
    });
    renderStep(archived, true);

    expect(screen.getByText("归档词条详情")).toBeVisible();
    expect(screen.getByText("词条已归档")).toBeVisible();
    expect(screen.getByText("已归档", { exact: true })).toBeVisible();
    expect(screen.queryByText("继续编辑")).toBeNull();
    expect(screen.queryByText("提交生效")).toBeNull();
    expect(document.querySelector(".word-step-actions")).toBeNull();
    expect(mutations.validate).not.toHaveBeenCalled();
  });

  it("published 的未发布修改在 edit 模式可重新校验并再次发布", async () => {
    const edited = wordFixture({
      status: "published",
      ready: true,
      revision: 4,
      published_revision: 3,
      has_unpublished_changes: true
    });
    const republished = wordFixture({
      status: "published",
      ready: true,
      revision: 4,
      published_revision: 4,
      has_unpublished_changes: false
    });
    mutations.validate.mockResolvedValue({
      validated_revision: 4,
      valid: true,
      issues: []
    });
    mutations.publish.mockResolvedValue({ word: republished });
    const { onPublished } = renderStep(edited, false);

    expect(
      await screen.findByText("完整性检查通过，可以提交生效")
    ).toBeVisible();
    fireEvent.click(button("提交生效"));

    await waitFor(() =>
      expect(mutations.publish).toHaveBeenCalledWith({
        base_revision: 4,
        idempotency_key: expect.any(String)
      })
    );
    expect(onPublished).toHaveBeenCalledWith(republished);
  });
});
