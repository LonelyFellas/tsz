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

  it("美式命中时锁定美式基准，仅编辑英式词形后创建草稿", async () => {
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
    expect(uk).not.toBeDisabled();
    expect(us).toBeDisabled();
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

    await act(async () => router.navigate("/words"));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    expect(router.state.location.pathname).toBe("/words/new");

    vi.mocked(window.confirm).mockReturnValue(true);
    await act(async () => router.navigate("/words"));
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

  it("重复词条展示生命周期状态，归档项提示可恢复并继续阻断创建", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("colour"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "colour" }
    });
    fireEvent.click(button("词典检测"));

    const duplicate = await screen.findByRole("link", {
      name: /colour \(uk\).*已归档/
    });
    expect(duplicate).toHaveAttribute(
      "href",
      "/words/fixture-colour/wizard/basics"
    );
    expect(screen.queryByText("草稿")).toBeNull();
    expect(screen.getByText("已发布")).toBeVisible();
    expect(screen.getByText("已归档")).toBeVisible();
    expect(screen.getByText("归档词条仍占用词头")).toBeVisible();
    expect(
      screen.getByText(
        "点击上方重复词条可进入详情并恢复，也可以在归档列表中定位。"
      )
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "在归档列表查看" })
    ).toHaveAttribute("href", "/words?keyword=colour&status=archived");
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("规范化回显与原输入不同时，未命中短语仍可创建 V2 空白草稿", async () => {
    const rawHeadword = "  ＢＲＡＮＤ   NEW PHRASE  ";
    const detection = detectionFixture(rawHeadword);
    const created = {
      ...wordFixture(),
      kind: "phrase" as const,
      headwords: { mode: "unified" as const, common: "BRAND NEW PHRASE" }
    };
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    const { onCreated } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: rawHeadword }
    });
    fireEvent.click(button("词典检测"));

    await waitFor(() =>
      expect(mutations.detect).toHaveBeenCalledWith({
        language: "en",
        headword: "ＢＲＡＮＤ   NEW PHRASE"
      })
    );
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
        headwords: { mode: "unified", common: "BRAND NEW PHRASE" }
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

  it("统一主词建议可手动切换为英美区分并分别修改", async () => {
    const detection = detectionFixture("far", "det-far");
    const created = wordFixture({ headword: "far" });
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    const { onHeadwordsChange } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "far" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).not.toBeChecked();
    expect(dialectSwitch).not.toBeDisabled();
    fireEvent.click(dialectSwitch);
    expect(dialectSwitch).toBeChecked();
    expect(screen.getByLabelText("英式主词")).not.toBeDisabled();
    expect(screen.getByLabelText("美式主词")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("英式主词"), {
      target: { value: "far-uk" }
    });
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "distinguish",
      uk: "far-uk",
      us: "far",
      source_dialect: "us"
    });
    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: "det-far",
        headwords: {
          mode: "distinguish",
          uk: "far-uk",
          us: "far",
          source_dialect: "us"
        }
      })
    );
    expect(await screen.findByText("forms-route")).toBeVisible();
  });

  it("模式往返切换时保留用户编辑过的非命中侧词形", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    const { onHeadwordsChange } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).toBeChecked();
    expect(dialectSwitch).not.toBeDisabled();
    expect(screen.getByLabelText("英式主词")).toHaveValue("centre");
    expect(screen.getByLabelText("英式主词")).not.toBeDisabled();
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
    expect(screen.getByLabelText("美式主词")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("英式主词"), {
      target: { value: "centre-alt" }
    });
    fireEvent.click(dialectSwitch);
    expect(dialectSwitch).not.toBeChecked();
    expect(screen.getByLabelText("英式主词")).toHaveValue("center");
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "unified",
      common: "center"
    });
    fireEvent.click(dialectSwitch);
    expect(dialectSwitch).toBeChecked();
    expect(screen.getByLabelText("英式主词")).toHaveValue("centre-alt");
    expect(screen.getByLabelText("美式主词")).toHaveValue("center");
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "distinguish",
      uk: "centre-alt",
      us: "center",
      source_dialect: "us"
    });
  });

  it("英式命中时锁定英式基准，仅允许编辑美式词形", async () => {
    const detection = detectionFixture("center");
    detection.matched_dialect = "uk";
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("测试夹具必须返回内置词典匹配结果");
    }
    detection.builtin_dictionary.headwords = {
      mode: "distinguish",
      uk: "centre",
      us: "center",
      source_dialect: "uk"
    };
    mutations.detect.mockResolvedValue(detection);
    const { onHeadwordsChange } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "centre" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByLabelText("英式主词")).toBeDisabled();
    expect(screen.getByLabelText("美式主词")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("美式主词"), {
      target: { value: "center-alt" }
    });
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "distinguish",
      uk: "centre",
      us: "center-alt",
      source_dialect: "uk"
    });
  });

  it("未检测到英美差异时仍可手动开启并编辑两侧词形", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("hello"));
    const { onHeadwordsChange } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "hello" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).not.toBeChecked();
    expect(dialectSwitch).not.toBeDisabled();
    expect(screen.getByLabelText("英式主词")).toHaveValue("hello");
    expect(screen.getByLabelText("美式主词")).toHaveValue("hello");
    fireEvent.click(dialectSwitch);
    fireEvent.change(screen.getByLabelText("英式主词"), {
      target: { value: "hello-uk" }
    });
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "distinguish",
      uk: "hello-uk",
      us: "hello",
      source_dialect: "us"
    });
  });

  it("内置词典未收录的短语保持统一模式，避免提交后端不接受的区分模式", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("BRAND NEW PHRASE"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "BRAND NEW PHRASE" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).not.toBeChecked();
    expect(dialectSwitch).toBeDisabled();
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
