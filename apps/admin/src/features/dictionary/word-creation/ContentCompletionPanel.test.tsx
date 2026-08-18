import { App } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentCompletionJobEnvelope } from "@tsz/types";
import { ContentCompletionPanel } from "./ContentCompletionPanel";
import { completeMeanings, wordFixture } from "./wordCreation.test.helper";

const api = vi.hoisted(() => ({
  response: undefined as ContentCompletionJobEnvelope | undefined,
  create: vi.fn(),
  retry: vi.fn(),
  refetch: vi.fn(),
  queryError: false
}));

vi.mock("./api", () => ({
  useCreateContentCompletionJob: () => ({
    mutateAsync: api.create,
    isPending: false
  }),
  useContentCompletionJob: (_wordId: string, jobId?: string) => ({
    data: jobId ? api.response : undefined,
    isError: api.queryError,
    refetch: api.refetch
  }),
  useRetryContentCompletionJob: () => ({
    mutateAsync: api.retry,
    isPending: false
  })
}));

function renderPanel(onApply = vi.fn()) {
  const word = wordFixture();
  api.response = {
    job: {
      id: "job-1",
      entry_id: word.id,
      base_revision: word.revision,
      status: "completed",
      requested_scope: ["grammar_structures", "meanings", "examples"],
      fill_policy: "missing_only",
      partitions: word.forms.pos.map((pos) => ({
        pos_id: pos.pos_id,
        pos: pos.pos,
        status: "completed",
        attempt: 1,
        provenance: {
          dictionary: {
            provider: "Kaikki",
            dataset_version: "dataset-v1",
            source_record_keys: ["source-1"]
          },
          generation: {
            provider: "openai",
            model: "configured-model",
            prompt_version: "lexicon-content-v1"
          },
          field_origins: {
            grammar_structures: "model_inferred",
            meanings: "dictionary_grounded_translation",
            examples: "model_generated",
            cefr: "model_inferred"
          },
          generated_at: "2026-08-18T00:00:01Z"
        }
      })),
      result: completeMeanings(
        structuredClone(word.meanings),
        word.headwords,
        word.forms
      ),
      created_at: "2026-08-18T00:00:00Z",
      updated_at: "2026-08-18T00:00:01Z"
    }
  };
  api.create.mockImplementation(async () => api.response!);
  render(
    <App>
      <ContentCompletionPanel
        word={word}
        content={word.meanings}
        onApply={onApply}
      />
    </App>
  );
  return { word, onApply };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.queryError = false;
  window.sessionStorage.clear();
});

describe("ContentCompletionPanel", () => {
  it("进入页面不自动请求，只有点击按钮才创建真实任务", async () => {
    const { word } = renderPanel();
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        idempotency_key: expect.any(String),
        base_revision: word.revision,
        scope: ["grammar_structures", "meanings", "examples"],
        fill_policy: "missing_only"
      })
    );
    expect(await screen.findByText(/来源：Kaikki/)).toBeInTheDocument();
    expect(screen.getByText(/来源记录：source-1/)).toBeInTheDocument();
  });

  it("回填只更新未保存表单，不调用保存接口", async () => {
    const { onApply } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "回填空缺内容" })
    );
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/内容尚未保存/)).toBeInTheDocument();
  });

  it("页面重载后恢复当前词条的任务与生成基线", async () => {
    const word = wordFixture();
    window.sessionStorage.setItem(
      `word-content-completion:${word.id}`,
      JSON.stringify({
        jobId: "job-1",
        baseline: JSON.stringify(word.meanings)
      })
    );
    const { onApply } = renderPanel();
    expect(await screen.findByText(/来源：Kaikki/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回填空缺内容" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
  });

  it("部分成功时保留可用结果并只重试失败或缺失词性", async () => {
    renderPanel();
    const failed = api.response!.job.partitions[0]!;
    failed.status = "failed";
    failed.error_code = "provider_timeout";
    failed.error_detail = "timed out";
    api.response!.job.status = "partial";
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    expect(
      await screen.findByText("部分词性生成失败；成功内容仍可安全回填")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试失败词性" }));
    await waitFor(() =>
      expect(api.retry).toHaveBeenCalledWith({
        idempotency_key: expect.any(String),
        pos_ids: [failed.pos_id]
      })
    );
    expect(screen.getByTitle("timed out")).toBeInTheDocument();
  });

  it("全失败时不展示回填按钮并允许重新生成", async () => {
    renderPanel();
    api.response!.job.status = "failed";
    api.response!.job.result = undefined;
    api.response!.job.partitions[0]!.status = "missing";
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    expect(
      await screen.findByText("本次没有可回填的生成结果")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "回填空缺内容" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新生成" })
    ).toBeInTheDocument();
  });

  it("pending/running 期间不提供重复生成入口", async () => {
    renderPanel();
    api.response!.job.status = "running";
    api.response!.job.result = undefined;
    api.response!.job.partitions[0]!.status = "running";
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    expect(await screen.findByText("正在生成")).toBeInTheDocument();
    expect(screen.getByText("模型正在生成内容")).toBeInTheDocument();
    expect(screen.getByText(/通常约 10–30 秒/)).toBeInTheDocument();
    expect(screen.getByText("读取词典依据")).toBeInTheDocument();
    expect(screen.getByText("生成结构化内容")).toBeInTheDocument();
    expect(screen.getByText("人工确认回填")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重新生成" })
    ).not.toBeInTheDocument();
  });

  it("pending 期间展示排队阶段且等待时间不为负数", async () => {
    renderPanel();
    api.response!.job.status = "pending";
    api.response!.job.result = undefined;
    api.response!.job.created_at = "2999-08-18T00:00:00Z";
    api.response!.job.partitions[0]!.status = "pending";
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    expect(await screen.findByText("任务已提交，等待处理")).toBeInTheDocument();
    expect(screen.getByText(/已等待 0 秒/)).toBeInTheDocument();
  });

  it("快速重复点击重新生成只创建一个任务", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    const regenerate = await screen.findByRole("button", {
      name: "重新生成"
    });
    api.create.mockClear();
    fireEvent.click(regenerate);
    fireEvent.click(regenerate);
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  });

  it("查询失败时保留表单并提供状态重试", () => {
    api.queryError = true;
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    expect(api.refetch).toHaveBeenCalledTimes(1);
  });

  it("生成后本地内容变化时阻止批量回填", async () => {
    const word = wordFixture();
    window.sessionStorage.setItem(
      `word-content-completion:${word.id}`,
      JSON.stringify({ jobId: "job-1", baseline: "different" })
    );
    const { onApply } = renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "回填空缺内容" })
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(
      await screen.findByText("生成后表单又有修改，为避免覆盖请重新生成")
    ).toBeInTheDocument();
  });

  it("revision 变化时阻止旧结果回填", async () => {
    const word = wordFixture();
    window.sessionStorage.setItem(
      `word-content-completion:${word.id}`,
      JSON.stringify({
        jobId: "job-1",
        baseline: JSON.stringify(word.meanings)
      })
    );
    const { onApply } = renderPanel();
    api.response!.job.base_revision += 1;
    fireEvent.click(
      await screen.findByRole("button", { name: "回填空缺内容" })
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(
      await screen.findByText("词条版本已变化，请基于最新内容重新生成")
    ).toBeInTheDocument();
  });

  it("浏览器会话存储不可用时仍可在当前页面生成", async () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementationOnce(() => {
        throw new Error("storage disabled");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("storage disabled");
      });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    expect(await screen.findByText(/来源：Kaikki/)).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("创建和重试错误不会清空现有表单", async () => {
    renderPanel();
    api.create.mockRejectedValueOnce(new Error("provider unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    expect(await screen.findByText("provider unavailable")).toBeInTheDocument();

    api.response!.job.status = "partial";
    api.response!.job.partitions[0]!.status = "failed";
    fireEvent.click(screen.getByRole("button", { name: "自动生成" }));
    api.retry.mockRejectedValueOnce("failed");
    fireEvent.click(
      await screen.findByRole("button", { name: "重试失败词性" })
    );
    expect(await screen.findByText("重试失败")).toBeInTheDocument();

    api.retry.mockRejectedValueOnce(new Error("retry unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "重试失败词性" }));
    expect(await screen.findByText("retry unavailable")).toBeInTheDocument();

    api.create.mockRejectedValueOnce("failed");
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    expect(await screen.findByText("自动生成失败")).toBeInTheDocument();
  });

  it("只读状态不展示生成入口", () => {
    const word = wordFixture({ status: "archived" });
    render(
      <App>
        <ContentCompletionPanel
          word={word}
          content={word.meanings}
          readOnly
          onApply={vi.fn()}
        />
      </App>
    );
    expect(screen.queryByText("自动生成")).not.toBeInTheDocument();
  });
});
