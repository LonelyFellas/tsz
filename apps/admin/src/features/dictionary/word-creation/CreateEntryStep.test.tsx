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
  AdminWordV2,
  PartOfSpeechCatalogResponse,
  WordHeadwordsV2
} from "@tsz/types";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateEntryStep } from "./CreateEntryStep";
import {
  deferred,
  detectionFixture,
  wordFixture
} from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  detect: vi.fn(),
  resetDetect: vi.fn(),
  create: vi.fn()
}));
const partOfSpeechCatalogState = vi.hoisted(() => ({
  data: undefined as PartOfSpeechCatalogResponse | null | undefined,
  isError: false
}));

vi.mock("./api", () => ({
  useDetectWordV2: () => ({
    mutateAsync: mutations.detect,
    reset: mutations.resetDetect,
    isPending: false
  }),
  useCreateWordV2: () => ({
    mutateAsync: mutations.create,
    isPending: false
  })
}));

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogFixture, partOfSpeechCatalogQueryResult } =
    await import("./partOfSpeech.test.helper");
  return {
    usePartOfSpeechCatalog: () => ({
      ...partOfSpeechCatalogQueryResult(),
      data:
        partOfSpeechCatalogState.data === undefined
          ? partOfSpeechCatalogFixture
          : (partOfSpeechCatalogState.data ?? undefined),
      isError: partOfSpeechCatalogState.isError
    })
  };
});

function button(label: string): HTMLButtonElement {
  const result = screen
    .getAllByRole("button")
    .find((item) => item.textContent?.replaceAll(/\s/g, "") === label);
  if (!result) throw new Error(`button not found: ${label}`);
  return result as HTMLButtonElement;
}

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function StepHarness({
  onCreated,
  onHeadwordsChange
}: {
  onCreated: (word: AdminWordV2) => void;
  onHeadwordsChange: (headwords?: WordHeadwordsV2) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <CreateEntryStep
        onHeadwordsChange={onHeadwordsChange}
        onCreated={(word) => {
          onCreated(word);
          navigate(`/words/${word.id}/wizard/forms`);
        }}
      />
      <LocationProbe />
    </>
  );
}

function renderStep() {
  const onHeadwordsChange = vi.fn();
  const onCreated = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/words/new",
        element: (
          <StepHarness
            onHeadwordsChange={onHeadwordsChange}
            onCreated={onCreated}
          />
        )
      },
      {
        path: "/words/:wordId/wizard/forms",
        element: (
          <>
            <span>forms-route</span>
            <LocationProbe />
          </>
        )
      },
      {
        path: "/words",
        element: (
          <>
            <span>words-list</span>
            <LocationProbe />
          </>
        )
      }
    ],
    { initialEntries: ["/words/new"] }
  );
  render(
    <AntApp>
      <RouterProvider router={router} />
    </AntApp>
  );
  return { onCreated, onHeadwordsChange, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  partOfSpeechCatalogState.data = undefined;
  partOfSpeechCatalogState.isError = false;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe("CreateEntryStep", () => {
  it("空词条或超过 200 字符时只显示本地校验且不发检测请求", async () => {
    renderStep();
    const input = screen.getByLabelText("录入词条");

    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("请输入词条")).toBeInTheDocument();
    expect(mutations.detect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "x".repeat(201) } });
    fireEvent.click(button("词典检测"));
    expect(
      await screen.findByText("词条不能超过 200 个字符")
    ).toBeInTheDocument();
    expect(mutations.detect).not.toHaveBeenCalled();
  });

  it("仅点击后检测，确认可编辑目标方言并用同一结果创建草稿", async () => {
    const detection = detectionFixture("center", "det-center");
    const created = wordFixture();
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    vi.mocked(window.confirm).mockReturnValue(false);
    const { onCreated, onHeadwordsChange, router } = renderStep();
    const input = screen.getByLabelText("录入词条");

    fireEvent.change(input, { target: { value: "  center  " } });
    expect(mutations.detect).not.toHaveBeenCalled();
    fireEvent.click(button("词典检测"));

    await waitFor(() =>
      expect(mutations.detect).toHaveBeenCalledWith({
        language: "en",
        headword: "center"
      })
    );
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    expect(screen.getByText("名词", { exact: true })).toBeVisible();
    expect(screen.getByText("动词", { exact: true })).toBeVisible();
    expect(screen.queryByText("n.", { exact: true })).toBeNull();
    expect(screen.queryByText("v.", { exact: true })).toBeNull();
    expect(onHeadwordsChange).toHaveBeenLastCalledWith(
      detection.builtin_dictionary.status === "matched"
        ? detection.builtin_dictionary.headwords
        : undefined
    );

    const uk = screen.getByLabelText("英式主词");
    const us = screen.getByLabelText("美式主词");
    expect(uk).not.toHaveAttribute("readonly");
    expect(us).toHaveAttribute("readonly");
    fireEvent.change(uk, { target: { value: "centre-alt" } });
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "distinguish",
      uk: "centre-alt",
      us: "center",
      source_dialect: "us"
    });

    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: "det-center",
        headwords: {
          mode: "distinguish",
          uk: "centre-alt",
          us: "center",
          source_dialect: "us"
        }
      })
    );
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(router.state.location.pathname).toBe(
      `/words/${created.id}/wizard/forms`
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("创建请求在途时锁定表单，避免响应覆盖点击后的继续编辑", async () => {
    const detection = detectionFixture("center", "det-slow-create");
    const created = wordFixture();
    const pending = deferred<{ word: AdminWordV2 }>();
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockReturnValue(pending.promise);
    const { router } = renderStep();

    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "center" } });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();

    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() => expect(mutations.create).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(input).toBeDisabled();
      expect(screen.getByLabelText("英式主词")).toBeDisabled();
    });

    await act(async () => pending.resolve({ word: created }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/words/${created.id}/wizard/forms`
      )
    );
  });

  it("录入后离开会请求确认，拒绝时留在当前页，确认后离开", async () => {
    const { router } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    vi.mocked(window.confirm).mockReturnValue(false);

    fireEvent.click(button("返回智能词库"));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    expect(router.state.location.pathname).toBe("/words/new");

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(button("返回智能词库"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/words"));
  });

  it("输入变化会清空检测并丢弃在途旧响应", async () => {
    const pending = deferred<ReturnType<typeof detectionFixture>>();
    mutations.detect.mockReturnValueOnce(pending.promise);
    const { onHeadwordsChange } = renderStep();
    const input = screen.getByLabelText("录入词条");

    fireEvent.change(input, { target: { value: "center" } });
    fireEvent.click(button("词典检测"));
    await waitFor(() => expect(mutations.detect).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "far" } });
    expect(mutations.resetDetect).toHaveBeenCalled();
    expect(onHeadwordsChange).toHaveBeenLastCalledWith(undefined);

    await act(async () => pending.resolve(detectionFixture("center")));
    expect(screen.queryByText("内置词典已找到规范词条")).toBeNull();
    expect(screen.getByText("等待检测")).toBeVisible();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
  });

  it.each([
    ["colour", "已存在重复词条"],
    ["smart-unavailable", "智能词库暂时不可用"]
  ])("%s 检测阻断创建并展示原因", async (headword, reason) => {
    mutations.detect.mockResolvedValue(detectionFixture(headword));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: headword }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText(reason)).toBeVisible();
    expect(screen.getByText("不可继续")).toBeVisible();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("重复词条链接进入 V2 向导，不落到真实模式已关闭的 legacy 编辑器", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("colour"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "colour" }
    });
    fireEvent.click(button("词典检测"));

    const duplicate = await screen.findByRole("link", {
      name: "colour (uk)"
    });
    expect(duplicate).toHaveAttribute(
      "href",
      "/words/fixture-colour/wizard/basics"
    );
  });

  it("未命中内置词典的短语可创建 V2 空白草稿", async () => {
    const detection = detectionFixture("in front of");
    const created = {
      ...wordFixture(),
      kind: "phrase" as const,
      headwords: { mode: "unified" as const, common: "in front of" }
    };
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    const { onCreated } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "in front of" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("内置词典没有匹配项，将创建空白短语草稿")
    ).toBeVisible();
    expect(screen.getByText("可创建")).toBeVisible();
    expect(button("确认并进入词形与发音")).toBeEnabled();
    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: detection.detection_id,
        headwords: { mode: "unified", common: "in front of" }
      })
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("检测错误保留原输入以便重试", async () => {
    mutations.detect.mockRejectedValue(new Error("dictionary timeout"));
    renderStep();
    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "center" } });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("dictionary timeout")).toBeInTheDocument();
    expect(input).toHaveValue("center");
  });

  it.each([
    ["not-found", "内置词典没有匹配项"],
    ["builtin-unavailable", "内置词典暂时不可用"]
  ])("%s 检测结果明确阻断人工创建", async (headword, reason) => {
    mutations.detect.mockResolvedValue(detectionFixture(headword));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: headword }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText(reason)).toBeVisible();
    expect(button("确认并进入词形与发音")).toBeDisabled();
  });

  it("统一主词检测结果可直接创建并显示 common 主词", async () => {
    const detection = detectionFixture("far", "det-far");
    const created = wordFixture({ headword: "far" });
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    const { onHeadwordsChange } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "far" }
    });
    fireEvent.click(button("词典检测"));

    await waitFor(() =>
      expect(
        screen
          .getAllByDisplayValue("far")
          .some((input) => input.hasAttribute("readonly"))
      ).toBe(true)
    );
    const callsBeforeReadonlyChanges = onHeadwordsChange.mock.calls.length;
    fireEvent.change(screen.getByLabelText("英式主词"), {
      target: { value: "changed-uk" }
    });
    fireEvent.change(screen.getByLabelText("美式主词"), {
      target: { value: "changed-us" }
    });
    expect(onHeadwordsChange).toHaveBeenCalledTimes(callsBeforeReadonlyChanges);
    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() => expect(mutations.create).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("forms-route")).toBeVisible();
  });

  it("检测到英美差异时开关自动开启并显示两套词形", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).toBeChecked();
    expect(dialectSwitch).toBeDisabled();
    expect(screen.getByLabelText("英式主词")).toHaveValue("centre");
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
  });

  it("未检测到英美差异时开关关闭禁用，英美两栏显示相同词形", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("hello"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "hello" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).not.toBeChecked();
    expect(dialectSwitch).toBeDisabled();
    expect(screen.getByLabelText("英式主词")).toHaveValue("hello");
    expect(screen.getByLabelText("美式主词")).toHaveValue("hello");
  });

  it("非 Error 检测失败使用稳定回退文案", async () => {
    mutations.detect.mockRejectedValue("offline");
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("词典检测失败")).toBeInTheDocument();
  });

  it("过期检测结果不会进入确认状态", async () => {
    const detection = detectionFixture("center");
    detection.expires_at = new Date(Date.now() - 1_000).toISOString();
    mutations.detect.mockResolvedValue(detection);
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("检测结果已过期，请重新检测")
    ).toBeInTheDocument();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
  });

  it("创建时检测凭证过期会清空结果并提示重新检测", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    mutations.create.mockRejectedValue(
      new HttpError(410, "detection expired", [], "detection_expired")
    );
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    fireEvent.click(button("确认并进入词形与发音"));

    expect(
      await screen.findByText("检测结果已过期，请重新检测")
    ).toBeInTheDocument();
    expect(mutations.resetDetect).toHaveBeenCalled();
    expect(screen.getByText("等待检测")).toBeVisible();
  });

  it.each([
    [new Error("create failed"), "create failed"],
    ["offline", "创建草稿失败"]
  ])("创建失败 %p 时显示稳定错误且保留检测结果", async (error, text) => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    mutations.create.mockRejectedValue(error);
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    fireEvent.click(button("确认并进入词形与发音"));

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText("内置词典已找到规范词条")).toBeVisible();
  });

  it("词性目录加载失败时显示提示并阻断创建", async () => {
    partOfSpeechCatalogState.data = null;
    partOfSpeechCatalogState.isError = true;
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("词性目录暂时不可用")).toBeVisible();
    expect(screen.getByText("不可继续")).toBeVisible();
    expect(button("确认并进入词形与发音")).toBeDisabled();
  });

  it("检测结果含未配置词性时显示稳定编码并阻断创建", async () => {
    const detection = detectionFixture("center");
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("fixture must be matched");
    }
    detection.builtin_dictionary.suggested_forms.pos[0]!.pos = "custom-pos";
    mutations.detect.mockResolvedValue(detection);
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("检测结果包含未配置词性")).toBeVisible();
    expect(screen.getAllByText("custom-pos").length).toBeGreaterThan(0);
    expect(button("确认并进入词形与发音")).toBeDisabled();
    expect(mutations.create).not.toHaveBeenCalled();
  });
});
