import { HttpError } from "@tsz/api-client";
import type {
  AdminWordV3,
  CreateAdminWordV3Input,
  DetectLexiconSurfaceResponseV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { V3CreateEntryStep } from "./V3CreateEntryStep";

function word(): AdminWordV3 {
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
      label: "centres / centers",
      matched_surfaces: ["centres", "centers"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: {
        mode: "shadow_only",
        blocked_code: "phase2_consumers_not_ready"
      },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: { pos: [] },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: [],
    max_reachable_step: "basics",
    created_by: "admin-1",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

function surfacePage(
  nextCursor: string | null,
  token?: string
): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "surface-snapshot",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 4,
    continuation_policy: "enabled",
    next_cursor: nextCursor,
    ...(nextCursor === null
      ? { surface_confirmation_token: token ?? "surface-token" }
      : {})
  } as SurfaceMatchPageV3;
}

function detection(
  overrides: Partial<DetectLexiconSurfaceResponseV3> = {}
): DetectLexiconSurfaceResponseV3 {
  return {
    schema_version: 3,
    detection_id: "detection-v3",
    expires_at: "2026-08-25T01:00:00Z",
    request: { language: "en", kind: "word", surface: "centres" },
    normalized_surface: "centres",
    builtin_dictionary: { status: "not_found" },
    matches: [],
    requires_acknowledgement: false,
    ...overrides
  };
}

describe("V3CreateEntryStep", () => {
  it("detects V3, loads every warning page, and creates with only the canonical DTO", async () => {
    const detect = vi.fn().mockResolvedValue(
      detection({
        requires_acknowledgement: true,
        surface_match_page: surfacePage("cursor-2")
      })
    );
    const surfacePageRequest = vi
      .fn()
      .mockResolvedValue(surfacePage(null, "terminal-token"));
    const create = vi.fn().mockResolvedValue({ word: word() });
    const onCreated = vi.fn();

    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: surfacePageRequest, create }}
        onCreated={onCreated}
      />
    );

    fireEvent.change(screen.getByLabelText("待创建词面"), {
      target: { value: "  centres  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));

    await waitFor(() =>
      expect(surfacePageRequest).toHaveBeenCalledWith(
        "surface-snapshot",
        "cursor-2",
        expect.any(AbortSignal)
      )
    );
    const createButton = await screen.findByRole("button", {
      name: "确认并创建 V3 草稿"
    });
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[1]).toEqual({
      schema_version: 3,
      detection_id: "detection-v3",
      kind: "word",
      confirmed_surface_match_token: "terminal-token"
    });
    expect(Object.keys(create.mock.calls[0]?.[1] ?? {})).not.toContain(
      "compatibility"
    );
    expect(onCreated).toHaveBeenCalledWith(word());
  });

  it("keeps the entered surface and detection after a failed create, then retries with the same key", async () => {
    const detect = vi.fn().mockResolvedValue(detection());
    const create = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ word: word() });

    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create }}
        onCreated={vi.fn()}
      />
    );

    const input = screen.getByLabelText("待创建词面");
    fireEvent.change(input, { target: { value: "centres" } });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    const createButton = await screen.findByRole("button", {
      name: "创建 V3 草稿"
    });
    fireEvent.click(createButton);

    expect(
      await screen.findByText("网络异常，创建失败，可原样重试。")
    ).toBeInTheDocument();
    expect(input).toHaveValue("centres");
    expect(screen.getByText("检测有效：centres")).toBeInTheDocument();

    fireEvent.click(createButton);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]?.[0]).toBe(create.mock.calls[0]?.[0]);
  });

  it.each([
    [new HttpError(401, "expired"), "登录已失效，请重新登录。"],
    [new HttpError(403, "forbidden"), "当前账号没有创建权限。"],
    [new HttpError(503, "off"), "V3 创建服务暂不可用，请稍后重试。"],
    [new Error("unexpected"), "创建失败，请按错误提示处理后重试。"]
  ])(
    "maps a failed detection through stable problem categories",
    async (failure, message) => {
      render(
        <V3CreateEntryStep
          requests={{
            detect: vi.fn().mockRejectedValue(failure),
            surfacePage: vi.fn(),
            create: vi.fn()
          }}
          onCreated={vi.fn()}
        />
      );
      fireEvent.change(screen.getByLabelText("待创建词面"), {
        target: { value: "centres" }
      });
      fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
  );

  it("fails closed when acknowledgement has no terminal token", async () => {
    render(
      <V3CreateEntryStep
        requests={{
          detect: vi
            .fn()
            .mockResolvedValue(detection({ requires_acknowledgement: true })),
          surfacePage: vi.fn(),
          create: vi.fn()
        }}
        onCreated={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("待创建词面"), {
      target: { value: "centres" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    expect(
      await screen.findByRole("button", { name: "确认并创建 V3 草稿" })
    ).toBeDisabled();
  });

  it("accepts a fresh V3 surface page from a create conflict and rotates the command key", async () => {
    const warning = new HttpError(
      409,
      "warning",
      [],
      "surface_match_acknowledgement_required",
      [],
      { surface_match_page: surfacePage(null, "fresh-token") }
    );
    const create = vi
      .fn()
      .mockRejectedValueOnce(warning)
      .mockResolvedValueOnce({ word: word() });
    render(
      <V3CreateEntryStep
        requests={{
          detect: vi.fn().mockResolvedValue(detection()),
          surfacePage: vi.fn(),
          create
        }}
        onCreated={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("待创建词面"), {
      target: { value: "centres" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );
    const retry = (await screen.findByText("确认并创建 V3 草稿")).closest(
      "button"
    );
    expect(retry).not.toBeNull();
    fireEvent.click(retry!);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]?.[0]).not.toBe(create.mock.calls[0]?.[0]);
    expect(create.mock.calls[1]?.[1]).toMatchObject({
      confirmed_surface_match_token: "fresh-token"
    });
  });

  it("requires a successful fresh detection before rotating a create key after an idempotency conflict", async () => {
    const detect = vi
      .fn()
      .mockResolvedValueOnce(detection())
      .mockRejectedValueOnce(new TypeError("refresh offline"))
      .mockResolvedValueOnce(
        detection({
          detection_id: "detection-refreshed",
          requires_acknowledgement: true,
          surface_match_page: surfacePage(null, "refreshed-token")
        })
      );
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(409, "reused", [], "idempotency_conflict")
      )
      .mockResolvedValueOnce({ word: word() });

    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create }}
        onCreated={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("待创建词面"), {
      target: { value: "centres" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );

    expect(
      await screen.findByText("创建状态已变化，请重新检测并确认后再创建。")
    ).toBeInTheDocument();
    expect(screen.queryByText("检测有效：centres")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /创建 V3 草稿/ })
    ).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("检测 V3 词面"));
    expect(
      await screen.findByText("网络异常，创建失败，可原样重试。")
    ).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: /创建 V3 草稿/ })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("检测 V3 词面"));
    const refreshedCreate = await screen.findByRole("button", {
      name: "确认并创建 V3 草稿"
    });
    fireEvent.click(refreshedCreate);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    expect(create.mock.calls[1]?.[0]).not.toBe(create.mock.calls[0]?.[0]);
    expect(create.mock.calls[1]?.[1]).toEqual({
      schema_version: 3,
      detection_id: "detection-refreshed",
      kind: "word",
      confirmed_surface_match_token: "refreshed-token"
    });
  });

  it("ignores a stale reconciliation detection after the surface changes", async () => {
    let resolveRefresh!: (value: DetectLexiconSurfaceResponseV3) => void;
    const detect = vi
      .fn()
      .mockResolvedValueOnce(detection())
      .mockImplementationOnce(
        () =>
          new Promise<DetectLexiconSurfaceResponseV3>((resolve) => {
            resolveRefresh = resolve;
          })
      )
      .mockResolvedValueOnce(
        detection({
          detection_id: "detection-new-input",
          normalized_surface: "centers",
          request: { language: "en", kind: "word", surface: "centers" }
        })
      );
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(409, "reused", [], "idempotency_conflict")
      )
      .mockResolvedValueOnce({ word: word() });

    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create }}
        onCreated={vi.fn()}
      />
    );
    const input = screen.getByLabelText("待创建词面");
    fireEvent.change(input, { target: { value: "centres" } });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );
    await screen.findByText("创建状态已变化，请重新检测并确认后再创建。");

    fireEvent.click(screen.getByText("检测 V3 词面"));
    fireEvent.change(input, { target: { value: "centers" } });
    fireEvent.click(screen.getByText("检测 V3 词面"));
    expect(detect).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("检测有效：centers")).toBeInTheDocument();

    await act(async () => resolveRefresh(detection()));
    expect(screen.getByText("检测有效：centers")).toBeInTheDocument();
    expect(screen.queryByText("检测有效：centres")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建 V3 草稿" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]?.[1]).toMatchObject({
      detection_id: "detection-new-input"
    });
  });

  it("supersedes an old detection when the input changes and accepts only the newest response", async () => {
    const resolvers: Array<(value: DetectLexiconSurfaceResponseV3) => void> =
      [];
    const detect = vi.fn(
      () =>
        new Promise<DetectLexiconSurfaceResponseV3>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const create = vi.fn().mockResolvedValue({ word: word() });
    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create }}
        onCreated={vi.fn()}
      />
    );

    const input = screen.getByLabelText("待创建词面");
    const detectButton = screen.getByRole("button", { name: "检测 V3 词面" });
    fireEvent.change(input, { target: { value: "centres" } });
    fireEvent.click(detectButton);
    fireEvent.change(input, { target: { value: "centers" } });
    fireEvent.click(detectButton);

    expect(detect).toHaveBeenCalledTimes(2);
    await act(async () =>
      resolvers[1]!(
        detection({
          detection_id: "detection-new",
          normalized_surface: "centers",
          request: { language: "en", kind: "word", surface: "centers" }
        })
      )
    );
    expect(screen.getByText("检测有效：centers")).toBeInTheDocument();

    await act(async () => resolvers[0]!(detection()));
    expect(screen.getByText("检测有效：centers")).toBeInTheDocument();
    expect(screen.queryByText("检测有效：centres")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建 V3 草稿" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      detection_id: "detection-new"
    });
  });

  it("locks every attempt-changing action during a slow create and accepts its success exactly once", async () => {
    const detect = vi.fn().mockResolvedValue(detection());
    let resolveCreate!: (value: { word: AdminWordV3 }) => void;
    const create = vi.fn(
      (_idempotencyKey: string, _input: CreateAdminWordV3Input) =>
        new Promise<{ word: AdminWordV3 }>((resolve) => {
          resolveCreate = resolve;
        })
    );
    const onCreated = vi.fn();
    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create }}
        onCreated={onCreated}
      />
    );

    const input = screen.getByLabelText("待创建词面");
    fireEvent.change(input, { target: { value: "centres" } });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );

    const detectButton = screen.getByText("检测 V3 词面").closest("button")!;
    const createButton = screen.getByText("创建 V3 草稿").closest("button")!;
    const lockedState = {
      input: input.matches(":disabled"),
      detect: detectButton.matches(":disabled"),
      create: createButton.matches(":disabled")
    };

    input.removeAttribute("disabled");
    detectButton.removeAttribute("disabled");
    createButton.removeAttribute("disabled");
    fireEvent.click(createButton);
    fireEvent.change(input, { target: { value: "centers" } });
    fireEvent.click(detectButton);

    await act(async () => resolveCreate({ word: word() }));

    expect({
      lockedState,
      surface: input.getAttribute("value"),
      detectCalls: detect.mock.calls.length,
      createCalls: create.mock.calls.length,
      createdCalls: onCreated.mock.calls.length
    }).toEqual({
      lockedState: { input: true, detect: true, create: true },
      surface: "centres",
      detectCalls: 1,
      createCalls: 1,
      createdCalls: 1
    });
    expect(onCreated).toHaveBeenCalledWith(word());
  });

  it("unlocks after a failed create and permits a fresh surface attempt", async () => {
    let rejectCreate!: (reason?: unknown) => void;
    const detect = vi
      .fn()
      .mockResolvedValueOnce(detection())
      .mockResolvedValueOnce(
        detection({
          detection_id: "detection-new",
          normalized_surface: "centers",
          request: { language: "en", kind: "word", surface: "centers" }
        })
      );
    const create = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ word: AdminWordV3 }>((_resolve, reject) => {
            rejectCreate = reject;
          })
      )
      .mockResolvedValueOnce({ word: { ...word(), id: "word-new" } });
    const onCreated = vi.fn();
    render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create }}
        onCreated={onCreated}
      />
    );

    const input = screen.getByLabelText("待创建词面");
    fireEvent.change(input, { target: { value: "centres" } });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );
    expect(input).toBeDisabled();

    await act(async () => rejectCreate(new TypeError("offline")));
    expect(
      await screen.findByText("网络异常，创建失败，可原样重试。")
    ).toBeInTheDocument();
    expect(input).toBeEnabled();

    fireEvent.change(input, { target: { value: "centers" } });
    fireEvent.click(screen.getByText("检测 V3 词面").closest("button")!);
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith({ ...word(), id: "word-new" });
    expect(detect).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("disposes pending detect and create attempts on unmount", async () => {
    let resolveDetect!: (value: DetectLexiconSurfaceResponseV3) => void;
    const detect = vi.fn(
      () =>
        new Promise<DetectLexiconSurfaceResponseV3>((resolve) => {
          resolveDetect = resolve;
        })
    );
    const detectView = render(
      <V3CreateEntryStep
        requests={{ detect, surfacePage: vi.fn(), create: vi.fn() }}
        onCreated={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("待创建词面"), {
      target: { value: "centres" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    detectView.unmount();
    await act(async () => resolveDetect(detection()));

    let resolveCreate!: (value: { word: AdminWordV3 }) => void;
    const onCreated = vi.fn();
    const createView = render(
      <V3CreateEntryStep
        requests={{
          detect: vi.fn().mockResolvedValue(detection()),
          surfacePage: vi.fn(),
          create: vi.fn(
            () =>
              new Promise<{ word: AdminWordV3 }>((resolve) => {
                resolveCreate = resolve;
              })
          )
        }}
        onCreated={onCreated}
      />
    );
    fireEvent.change(screen.getByLabelText("待创建词面"), {
      target: { value: "centres" }
    });
    fireEvent.click(screen.getByRole("button", { name: "检测 V3 词面" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "创建 V3 草稿" })
    );
    createView.unmount();
    await act(async () => resolveCreate({ word: word() }));
    expect(onCreated).not.toHaveBeenCalled();
  });
});
