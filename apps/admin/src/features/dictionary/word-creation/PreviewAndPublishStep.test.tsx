import { HttpError } from "@tsz/api-client/http";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewAndPublishStep } from "./PreviewAndPublishStep";
import { wordFixture } from "./wordCreation.test.helper";

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
      {location.pathname}|{JSON.stringify(location.state)}
    </span>
  );
}

function renderStep(word = wordFixture({ ready: true })) {
  const onPublished = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/words/${word.id}/wizard/preview`]}>
      <AntApp>
        <PreviewAndPublishStep word={word} onPublished={onPublished} />
        <LocationProbe />
      </AntApp>
    </MemoryRouter>
  );
  return { onPublished, word };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PreviewAndPublishStep", () => {
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
  });

  it("published 只读详情不重复 validate，展示发布时间并返回列表", () => {
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

    fireEvent.click(button("返回智能词库"));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/words\|/);
  });
});
