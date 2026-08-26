import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import type {
  AdminWordPublicationV3,
  AdminWordV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  createV3WordRequests,
  type V3WordsApi,
  type V3WordRequests
} from "@/features/dictionary/word-creation-v3/api";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt,
  UUIDS
} from "@/features/dictionary/word-creation-v3/fixtures";
import { WordWizardV3Page, type V3MeaningsStepRenderer } from "./WordWizardV3";

const WORD_ID = "019d2c55-1f9e-7f88-a189-a2b8a07153fb";

function word(overrides: Partial<AdminWordV3> = {}): AdminWordV3 {
  return {
    schema_version: 3,
    id: WORD_ID,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: "centre",
      matched_surfaces: ["centre"],
      strategy_version: "v3"
    },
    capabilities: {
      publication: {
        mode: "shadow_only",
        blocked_code: "phase2_consumers_not_ready"
      },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: formsFixture(),
    meanings: { sense_groups: [], pos: [] },
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: "019d2c55-1f9e-7f88-a189-a2b8a07153fc",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
    ...overrides
  };
}

function source(getAnyValue: unknown) {
  return {
    detectV3: vi.fn(),
    surfaceMatchSnapshotPageV3: vi.fn(),
    createV3: vi.fn(),
    getAny: vi.fn(async () => getAnyValue),
    previewFormsImpactV3: vi.fn(async () => ({
      schema_version: 3,
      base_revision: 1,
      requires_confirmation: false,
      affected: []
    })),
    saveFormsStepV3: vi.fn(),
    saveMeaningsStepV3: vi.fn(),
    validateV3: vi.fn(async () => ({
      schema_version: 3,
      validated_revision: 1,
      valid: true,
      issues: []
    })),
    publishV3: vi.fn(),
    listPublications: vi.fn(async () => ({ publications: [] })),
    getPublication: vi.fn(),
    activatePublicationV3: vi.fn()
  } as unknown as V3WordsApi;
}

function publication(
  current: AdminWordV3,
  overrides: Partial<AdminWordPublicationV3> = {}
): AdminWordPublicationV3 {
  return {
    schema_version: 3,
    publication_id: "publication-v3-history",
    entry_id: current.id,
    publication_number: 1,
    source_revision: current.revision,
    published_by_admin_id: current.created_by,
    published_at: "2026-08-25T01:00:00Z",
    is_current: false,
    word: {
      ...current,
      status: "published",
      has_unpublished_changes: false
    },
    ...overrides
  };
}

function impactSurfacePage(nextCursor: string | null): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "impact-snapshot",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 9,
    continuation_policy: "enabled",
    next_cursor: nextCursor,
    ...(nextCursor === null
      ? {
          surface_confirmation_token: "surface-terminal-token",
          impact_confirmation_token: "impact-terminal-token"
        }
      : {})
  } as SurfaceMatchPageV3;
}

function renderPage(
  entry: string,
  requests: V3WordRequests,
  renderMeaningsStep?: V3MeaningsStepRenderer
) {
  const router = createMemoryRouter(
    [
      {
        path: "/words/:wordId/v3/wizard/:step",
        element: (
          <WordWizardV3Page
            requests={requests}
            renderMeaningsStep={renderMeaningsStep}
          />
        )
      }
    ],
    { initialEntries: [entry] }
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </QueryClientProvider>
  );
  return router;
}

describe("WordWizardV3Page", () => {
  it("loads through getAny, narrows V3 and wires the controlled T4 forms slot", async () => {
    const current = word();
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms`,
      createV3WordRequests(endpoints)
    );

    expect(await screen.findByText("centre")).toBeInTheDocument();
    expect(screen.getByText("名词")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存草稿" })
    ).toBeInTheDocument();
    expect(endpoints.getAny).toHaveBeenCalledWith(WORD_ID);
  });

  it("previews every surface page and saves forms through the wizard flow with both confirmation tokens", async () => {
    const current = word();
    const firstPage = impactSurfacePage("cursor-2");
    const terminalPage = impactSurfacePage(null);
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.previewFormsImpactV3).mockResolvedValueOnce({
      schema_version: 3,
      base_revision: 1,
      requires_confirmation: true,
      affected: [
        {
          node_id: current.forms.pos[0]!.forms[0]!.id,
          node_type: "form",
          reason: "referenced by an existing sense"
        }
      ],
      surface_match_page: firstPage
    });
    vi.mocked(endpoints.surfaceMatchSnapshotPageV3).mockResolvedValueOnce(
      terminalPage
    );
    vi.mocked(endpoints.saveFormsStepV3).mockResolvedValueOnce({
      word: { ...current, revision: 2 }
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByText("保存草稿"));

    await waitFor(() =>
      expect(endpoints.previewFormsImpactV3).toHaveBeenCalledWith(WORD_ID, {
        schema_version: 3,
        base_revision: 1,
        content: current.forms
      })
    );
    await waitFor(() =>
      expect(endpoints.surfaceMatchSnapshotPageV3).toHaveBeenCalledWith(
        "impact-snapshot",
        "cursor-2",
        expect.any(AbortSignal)
      )
    );
    expect(
      screen.getByText(/关联内容将随本次调整受到影响。/)
    ).toBeInTheDocument();
    expect(endpoints.saveFormsStepV3).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(
        screen.getByText("确认影响并保存草稿").closest("button")
      ).toBeEnabled()
    );
    await waitFor(() =>
      expect(screen.getByText("保存草稿").closest("button")).not.toHaveClass(
        "ant-btn-loading"
      )
    );
    fireEvent.click(screen.getByText("确认影响并保存草稿").closest("button")!);

    await waitFor(() =>
      expect(endpoints.saveFormsStepV3).toHaveBeenCalledWith(WORD_ID, {
        schema_version: 3,
        base_revision: 1,
        intent: "save",
        content: current.forms,
        confirmed_surface_match_token: "surface-terminal-token",
        confirmed_impact_token: "impact-terminal-token"
      })
    );
  });

  it("saves immediately after an impact preview that needs no confirmation", async () => {
    const current = word();
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.saveFormsStepV3).mockResolvedValueOnce({
      word: { ...current, revision: 2 }
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByText("保存草稿"));

    await waitFor(() =>
      expect(endpoints.previewFormsImpactV3).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(endpoints.saveFormsStepV3).toHaveBeenCalledWith(WORD_ID, {
        schema_version: 3,
        base_revision: 1,
        intent: "save",
        content: current.forms
      })
    );
  });

  it("requires an explicit acknowledgement before completing a token-only impact", async () => {
    const current = word();
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.previewFormsImpactV3).mockResolvedValueOnce({
      schema_version: 3,
      base_revision: 1,
      requires_confirmation: true,
      confirmation_token: "impact-token",
      affected: [
        {
          node_id: current.forms.pos[0]!.forms[0]!.id,
          node_type: "form",
          reason: "referenced by an existing relation"
        }
      ]
    });
    vi.mocked(endpoints.saveFormsStepV3).mockResolvedValueOnce({
      word: { ...current, revision: 2 }
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByText("完成词形"));

    expect(await screen.findByText("确认影响并完成词形")).toBeInTheDocument();
    expect(endpoints.saveFormsStepV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("确认影响并完成词形"));

    await waitFor(() =>
      expect(endpoints.saveFormsStepV3).toHaveBeenCalledWith(WORD_ID, {
        schema_version: 3,
        base_revision: 1,
        intent: "complete",
        content: current.forms,
        confirmed_impact_token: "impact-token"
      })
    );
  });

  it("invalidates a prepared confirmation when the exact forms draft changes", async () => {
    const current = word();
    const formId = current.forms.pos[0]!.forms[0]!.id;
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.previewFormsImpactV3)
      .mockResolvedValueOnce({
        schema_version: 3,
        base_revision: 1,
        requires_confirmation: true,
        confirmation_token: "stale-impact-token",
        affected: [
          {
            node_id: formId,
            node_type: "form",
            reason: "referenced by an existing relation"
          }
        ]
      })
      .mockResolvedValueOnce({
        schema_version: 3,
        base_revision: 1,
        requires_confirmation: false,
        affected: []
      });
    vi.mocked(endpoints.saveFormsStepV3).mockResolvedValueOnce({
      word: { ...current, revision: 2 }
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByText("保存草稿"));
    expect(await screen.findByText("确认影响并保存草稿")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(`词形 1通用拼写`), {
      target: { value: "center-updated" }
    });
    await waitFor(() =>
      expect(screen.queryByText("确认影响并保存草稿")).toBeNull()
    );
    fireEvent.click(screen.getByText("保存草稿"));

    await waitFor(() =>
      expect(endpoints.saveFormsStepV3).toHaveBeenCalledTimes(1)
    );
    const request = vi.mocked(endpoints.saveFormsStepV3).mock.calls[0]![1];
    expect(
      request.content.pos[0]!.forms[0]!.regional_variants.mode === "common"
        ? request.content.pos[0]!.forms[0]!.regional_variants.common.spelling
        : undefined
    ).toBe("center-updated");
    expect(request).not.toHaveProperty("confirmed_impact_token");
    expect(request).not.toHaveProperty("confirmed_surface_match_token");
  });

  it("fails closed when getAny is not schema V3", async () => {
    const endpoints = source({ word: { schema_version: 2 } });
    renderPage(
      "/words/legacy-v2/v3/wizard/forms",
      createV3WordRequests(endpoints)
    );

    expect(await screen.findByText("无法打开词条")).toBeInTheDocument();
    expect(
      screen.getByText("当前前端不支持该词条数据版本，请升级后重试")
    ).toBeInTheDocument();
    expect(screen.queryByText("noun")).toBeNull();
  });

  it("maps preview to the T5B controlled controller without duplicate requests", async () => {
    const current = word({
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(endpoints)
    );

    const prepare = await screen.findByRole("button", {
      name: "检查发布条件"
    });
    fireEvent.click(prepare);
    fireEvent.click(prepare);

    await waitFor(() => expect(endpoints.validateV3).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(endpoints.previewFormsImpactV3).toHaveBeenCalledTimes(1)
    );
  });

  it("preserves an unsaved forms draft across steps and gates canonical preview actions", async () => {
    const current = word({
      status: "published",
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    const historical = publication(current);
    vi.mocked(endpoints.listPublications).mockResolvedValue({
      publications: [historical]
    });
    vi.mocked(endpoints.getPublication).mockResolvedValue({
      publication: historical
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms?mode=edit`,
      createV3WordRequests(endpoints)
    );

    fireEvent.change(await screen.findByLabelText(`词形 1通用拼写`), {
      target: { value: "centre-local-draft" }
    });
    fireEvent.click(screen.getByText("释义与例句"));
    expect(await screen.findByText("释义组")).toBeInTheDocument();
    fireEvent.click(screen.getByText("词形与发音"));
    expect(await screen.findByLabelText(`词形 1通用拼写`)).toHaveValue(
      "centre-local-draft"
    );

    fireEvent.click(screen.getByText("核对与发布"));

    expect(await screen.findByText("请先保存未保存的草稿")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查发布条件" })).toBeNull();
    expect(endpoints.validateV3).not.toHaveBeenCalled();
    expect(endpoints.previewFormsImpactV3).not.toHaveBeenCalled();
    expect(endpoints.publishV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
    expect(
      await screen.findByText("请先保存或放弃未保存的草稿")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "激活此发布版本" })
    ).toBeDisabled();
    expect(endpoints.activatePublicationV3).not.toHaveBeenCalled();
  });

  it("preserves an unsaved meanings draft across steps and gates canonical preview actions", async () => {
    const current = word({
      status: "published",
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    const historical = publication(current);
    vi.mocked(endpoints.listPublications).mockResolvedValue({
      publications: [historical]
    });
    vi.mocked(endpoints.getPublication).mockResolvedValue({
      publication: historical
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/meanings?mode=edit`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增释义组" }));
    const groupName = await screen.findByLabelText("释义组 1 中文名称");
    fireEvent.change(groupName, { target: { value: "本地释义组" } });
    fireEvent.click(screen.getByText("词形与发音"));
    expect(await screen.findByLabelText(`词形 1通用拼写`)).toBeInTheDocument();
    fireEvent.click(screen.getByText("释义与例句"));
    expect(await screen.findByLabelText("释义组 1 中文名称")).toHaveValue(
      "本地释义组"
    );

    fireEvent.click(screen.getByText("核对与发布"));

    expect(await screen.findByText("请先保存未保存的草稿")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查发布条件" })).toBeNull();
    expect(endpoints.validateV3).not.toHaveBeenCalled();
    expect(endpoints.previewFormsImpactV3).not.toHaveBeenCalled();
    expect(endpoints.publishV3).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
    expect(
      await screen.findByText("请先保存或放弃未保存的草稿")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "激活此发布版本" })
    ).toBeDisabled();
    expect(endpoints.activatePublicationV3).not.toHaveBeenCalled();
  });

  it("retains an unsaved meanings draft when saving forms advances canonical revision", async () => {
    const current = word({
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview"
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.saveFormsStepV3).mockImplementationOnce(
      async (_wordId, input) => ({
        word: { ...current, revision: 2, forms: input.content }
      })
    );
    renderPage(
      `/words/${WORD_ID}/v3/wizard/meanings`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增释义组" }));
    fireEvent.change(await screen.findByLabelText("释义组 1 中文名称"), {
      target: { value: "词形保存后仍保留" }
    });
    fireEvent.click(screen.getByText("词形与发音"));
    fireEvent.change(await screen.findByLabelText(`词形 1通用拼写`), {
      target: { value: "centre-forms-saved" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() =>
      expect(endpoints.saveFormsStepV3).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByText("释义与例句"));
    expect(await screen.findByLabelText("释义组 1 中文名称")).toHaveValue(
      "词形保存后仍保留"
    );
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
  });

  it("retains an unsaved forms draft when saving meanings advances canonical revision", async () => {
    const current = word({
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview"
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.saveMeaningsStepV3).mockImplementationOnce(
      async (_wordId, input) => ({
        word: {
          ...current,
          revision: 2,
          meanings: { sense_groups: input.content.sense_groups, pos: [] }
        }
      })
    );
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms`,
      createV3WordRequests(endpoints)
    );

    fireEvent.change(await screen.findByLabelText(`词形 1通用拼写`), {
      target: { value: "centre-unsaved-forms" }
    });
    fireEvent.click(screen.getByText("释义与例句"));
    fireEvent.click(await screen.findByRole("button", { name: "新增释义组" }));
    fireEvent.change(await screen.findByLabelText("释义组 1 中文名称"), {
      target: { value: "已保存释义" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() =>
      expect(endpoints.saveMeaningsStepV3).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByText("词形与发音"));
    expect(await screen.findByLabelText(`词形 1通用拼写`)).toHaveValue(
      "centre-unsaved-forms"
    );
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
  });

  it("publishes an eligible draft and immediately transitions the live page to read-only", async () => {
    const current = word({
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.publishV3).mockResolvedValueOnce({
      word: {
        ...current,
        status: "published",
        revision: 2,
        has_unpublished_changes: false
      }
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "检查发布条件" })
    );
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));

    await waitFor(() => expect(endpoints.publishV3).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("当前词条为只读查看")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "检查发布条件" })).toBeNull();
  });

  it("makes immutable publication history and detail reachable from the real preview route", async () => {
    const current = word({
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const historical = publication(current, {
      word: {
        ...current,
        status: "published",
        has_unpublished_changes: false,
        presentation: {
          label: "immutable history detail",
          matched_surfaces: [],
          strategy_version: "surface_summary_v1"
        }
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.listPublications).mockResolvedValueOnce({
      publications: [historical]
    });
    vi.mocked(endpoints.getPublication).mockResolvedValueOnce({
      publication: historical
    });

    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(endpoints)
    );

    expect(await screen.findByText("发布历史")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
    expect(
      await screen.findByText("immutable history detail")
    ).toBeInTheDocument();
    expect(endpoints.getPublication).toHaveBeenCalledWith(
      WORD_ID,
      "publication-v3-history"
    );
  });

  it("activates from history and replaces the page canonical/read-only state", async () => {
    const current = word({
      status: "published",
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const historical = publication(current);
    const activated = word({
      status: "published",
      revision: 2,
      lifecycle_revision: 2,
      has_unpublished_changes: false,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      },
      presentation: {
        label: "activated canonical",
        matched_surfaces: ["activated canonical"],
        strategy_version: "surface_summary_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.listPublications).mockResolvedValue({
      publications: [historical]
    });
    vi.mocked(endpoints.getPublication).mockResolvedValue({
      publication: historical
    });
    vi.mocked(endpoints.activatePublicationV3).mockResolvedValue({
      word: activated
    });

    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 1 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    await waitFor(() =>
      expect(endpoints.activatePublicationV3).toHaveBeenCalledWith(
        WORD_ID,
        "publication-v3-history",
        expect.any(String),
        {
          schema_version: 3,
          base_revision: 1,
          base_lifecycle_revision: 1
        }
      )
    );
    expect(await screen.findByText("当前词条为只读查看")).toBeInTheDocument();
    expect(screen.getAllByText("activated canonical").length).toBeGreaterThan(
      0
    );
  });

  it("refreshes after an activation conflict, clears preview confirmation state, and uses the latest base revisions", async () => {
    const current = word({
      status: "published",
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const expired = publication(current);
    const freshWord = word({
      status: "published",
      revision: 5,
      lifecycle_revision: 4,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const fresh = publication(freshWord, {
      publication_id: "publication-v3-fresh",
      publication_number: 2,
      source_revision: 5
    });
    const activated = word({
      status: "published",
      revision: 6,
      lifecycle_revision: 5,
      has_unpublished_changes: false,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.getAny)
      .mockResolvedValueOnce({ word: current, retired_stable_nodes: [] })
      .mockResolvedValue({ word: freshWord, retired_stable_nodes: [] });
    vi.mocked(endpoints.listPublications)
      .mockResolvedValueOnce({ publications: [expired] })
      .mockResolvedValue({ publications: [fresh] });
    vi.mocked(endpoints.getPublication).mockImplementation(
      async (_wordId, publicationId) => ({
        publication: publicationId === "publication-v3-fresh" ? fresh : expired
      })
    );
    vi.mocked(endpoints.activatePublicationV3)
      .mockRejectedValueOnce(
        new HttpError(409, "stale revision", [], "revision_conflict")
      )
      .mockResolvedValueOnce({ word: activated });

    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview?mode=edit`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "检查发布条件" })
    );
    expect(
      await screen.findByRole("button", { name: "发布词条" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    await waitFor(() => expect(endpoints.getAny).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", { name: "检查发布条件" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();
    expect(screen.queryByRole("button", { name: "确认激活" })).toBeNull();

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    await waitFor(() =>
      expect(endpoints.activatePublicationV3).toHaveBeenCalledTimes(2)
    );
    const activationCalls = vi.mocked(endpoints.activatePublicationV3).mock
      .calls;
    expect(activationCalls[1]![3]).toEqual({
      schema_version: 3,
      base_revision: 5,
      base_lifecycle_revision: 4
    });
    expect(activationCalls[1]![2]).not.toBe(activationCalls[0]![2]);
  });

  it.each(["published", "archived"] as const)(
    "keeps the %s viewing route read-only",
    async (status) => {
      const current = word({
        status,
        has_unpublished_changes: false,
        completed_steps: ["basics", "forms", "meanings"],
        max_reachable_step: "preview",
        capabilities: {
          publication: { mode: "migration_canary", whitelisted: true },
          pronunciation_normalization_version: "nfkc_trim_lower_v1"
        }
      });
      const endpoints = source({ word: current, retired_stable_nodes: [] });
      renderPage(
        `/words/${WORD_ID}/v3/wizard/preview`,
        createV3WordRequests(endpoints)
      );

      expect((await screen.findAllByText("centre")).length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: "检查发布条件" })).toBeNull();
      expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();
      expect(screen.queryByRole("button", { name: "保存草稿" })).toBeNull();
      expect(
        screen.getAllByText("词形与发音")[0]?.closest(".ant-steps-item")
      ).toHaveClass("ant-steps-item-disabled");
      expect(endpoints.validateV3).not.toHaveBeenCalled();
      expect(endpoints.previewFormsImpactV3).not.toHaveBeenCalled();
      expect(endpoints.publishV3).not.toHaveBeenCalled();
    }
  );

  it("offers a clean published entry a direct continuation into forms edit", async () => {
    const current = word({
      status: "published",
      has_unpublished_changes: false,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview"
    });
    const router = renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] }))
    );

    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));

    await waitFor(() =>
      expect(router.state.location).toMatchObject({
        pathname: `/words/${WORD_ID}/v3/wizard/forms`,
        search: "?mode=edit"
      })
    );
    expect(
      await screen.findByRole("button", { name: "保存草稿" })
    ).toBeEnabled();
  });

  it("does not offer an archived entry a continuation into edit", async () => {
    const current = word({
      status: "archived",
      has_unpublished_changes: false,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview"
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] }))
    );

    expect((await screen.findAllByText("centre")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "继续编辑" })).toBeNull();
  });

  it("renders the read-only POS groups, shared form identity, regional sides, and pronunciation styles", async () => {
    const shared = commonFormFixture({
      pronunciations: [
        pronunciationFixture({
          id: UUIDS.pronunciation,
          style: "normal",
          dict_phonetic: "sen-tre",
          actual_pron: "centre"
        }),
        pronunciationFixture({
          id: UUIDS.pronunciation_2,
          style: "strong",
          dict_phonetic: "sen-tr",
          actual_pron: "centr"
        })
      ]
    });
    const regional = ukUsFormFixture({
      uk: {
        pronunciations: [
          pronunciationFixture({
            id: uuidFromInt(904),
            style: "normal",
            dict_phonetic: "sen-tre-uk",
            actual_pron: "centre-uk"
          })
        ]
      },
      us: {
        pronunciations: [
          pronunciationFixture({
            id: UUIDS.pronunciation_3,
            style: "weak",
            dict_phonetic: "sen-ter",
            actual_pron: "center"
          })
        ]
      }
    });
    const current = word({
      status: "published",
      has_unpublished_changes: false,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      forms: formsFixture({
        forms: [shared, regional],
        groups: [
          {
            id: UUIDS.group,
            is_regular: true,
            members: [
              { id: UUIDS.membership, form_id: shared.id },
              { id: UUIDS.membership_2, form_id: regional.id }
            ]
          },
          {
            id: UUIDS.group_2,
            is_regular: false,
            members: [{ id: UUIDS.membership_3, form_id: shared.id }]
          }
        ]
      })
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] }))
    );

    expect(
      await screen.findByTestId(`readonly-group-${UUIDS.group}`)
    ).toHaveTextContent("变化组 1");
    expect(
      screen.getByTestId(`readonly-group-${UUIDS.group_2}`)
    ).toHaveTextContent("变化组 2");
    expect(
      screen.getByTestId(`readonly-membership-${UUIDS.membership_3}`)
    ).toHaveTextContent("1. 原形 · centre");
    expect(screen.getAllByTestId(`readonly-form-${shared.id}`)).toHaveLength(1);
    expect(
      screen.getByTestId(`readonly-form-${regional.id}`)
    ).toHaveTextContent("英式");
    expect(
      screen.getByTestId(`readonly-form-${regional.id}`)
    ).toHaveTextContent("美式");
    expect(
      screen.getByTestId(`readonly-pronunciation-${UUIDS.pronunciation}`)
    ).toHaveTextContent("常规 · 词典音标 sen-tre · 实际发音 centre");
    expect(
      screen.getByTestId(`readonly-pronunciation-${UUIDS.pronunciation_2}`)
    ).toHaveTextContent("强读 · 词典音标 sen-tr · 实际发音 centr");
    expect(
      screen.getByTestId(`readonly-pronunciation-${UUIDS.pronunciation_3}`)
    ).toHaveTextContent("弱读 · 词典音标 sen-ter · 实际发音 center");
    expect(
      screen.getByTestId(`readonly-pronunciation-${uuidFromInt(904)}`)
    ).toHaveTextContent("常规 · 词典音标 sen-tre-uk · 实际发音 centre-uk");
  });

  it("keeps empty read-only groups and pronunciations visible", async () => {
    const form = commonFormFixture({
      spelling: "plain-readonly",
      pronunciations: []
    });
    const current = word({
      status: "published",
      has_unpublished_changes: false,
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      forms: formsFixture({ forms: [form], groups: [] })
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/preview`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] }))
    );

    expect(await screen.findByText("暂无变化组")).toBeInTheDocument();
    expect(screen.getByTestId(`readonly-form-${form.id}`)).toHaveTextContent(
      "通用"
    );
    expect(screen.getByTestId(`readonly-form-${form.id}`)).toHaveTextContent(
      "plain-readonly"
    );
    expect(screen.getByText("暂无发音")).toBeInTheDocument();
  });

  it("keeps an explicitly editing published draft writable", async () => {
    const current = word({
      status: "published",
      has_unpublished_changes: true,
      max_reachable_step: "forms"
    });
    renderPage(
      `/words/${WORD_ID}/v3/wizard/forms?mode=edit`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] }))
    );

    expect(await screen.findByText("保存草稿")).toBeInTheDocument();
    expect(
      screen.getByText("词形与发音").closest(".ant-steps-item")
    ).not.toHaveClass("ant-steps-item-disabled");
  });

  it("keeps a typed meanings slot ready for T5C without adding a request flow", async () => {
    const current = word({ max_reachable_step: "meanings" });
    const renderer: V3MeaningsStepRenderer = vi.fn((context) => (
      <div>T5C slot revision {context.word.revision}</div>
    ));
    renderPage(
      `/words/${WORD_ID}/v3/wizard/meanings`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] })),
      renderer
    );

    expect(await screen.findByText("T5C slot revision 1")).toBeInTheDocument();
    expect(renderer).toHaveBeenCalled();
  });

  it("wires the real T5C editor to the wizard's single save flow", async () => {
    const current = word({
      status: "published",
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    const historical = publication(current);
    vi.mocked(endpoints.listPublications).mockResolvedValue({
      publications: [historical]
    });
    vi.mocked(endpoints.getPublication).mockResolvedValue({
      publication: historical
    });
    vi.mocked(endpoints.saveMeaningsStepV3).mockImplementationOnce(
      async (_wordId, input) => ({
        word: {
          ...current,
          revision: 2,
          meanings: { sense_groups: input.content.sense_groups, pos: [] }
        }
      })
    );
    renderPage(
      `/words/${WORD_ID}/v3/wizard/meanings?mode=edit`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增释义组" }));
    fireEvent.change(await screen.findByLabelText("释义组 1 中文名称"), {
      target: { value: "已保存释义组" }
    });
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() =>
      expect(endpoints.saveMeaningsStepV3).toHaveBeenCalledWith(WORD_ID, {
        schema_version: 3,
        base_revision: 1,
        intent: "save",
        content: {
          sense_groups: [
            {
              id: expect.any(String),
              name_zh: "已保存释义组",
              name_en: ""
            }
          ],
          pos: []
        }
      })
    );
    await waitFor(() =>
      expect(screen.queryByText("有未保存的草稿")).toBeNull()
    );
    expect(screen.queryByText("有未保存的草稿")).toBeNull();
    fireEvent.click(screen.getByText("核对与发布"));
    expect(
      await screen.findByRole("button", { name: "检查发布条件" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
    expect(
      await screen.findByRole("button", { name: "激活此发布版本" })
    ).toBeEnabled();
  });

  it("retains a dirty meanings draft and save gate after a failed save", async () => {
    const current = word({
      completed_steps: ["basics", "forms", "meanings"],
      max_reachable_step: "preview",
      capabilities: {
        publication: { mode: "migration_canary", whitelisted: true },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      }
    });
    const endpoints = source({ word: current, retired_stable_nodes: [] });
    vi.mocked(endpoints.saveMeaningsStepV3).mockRejectedValueOnce(
      new HttpError(500, "save failed")
    );
    renderPage(
      `/words/${WORD_ID}/v3/wizard/meanings`,
      createV3WordRequests(endpoints)
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增释义组" }));
    fireEvent.change(await screen.findByLabelText("释义组 1 中文名称"), {
      target: { value: "失败后仍保留" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    expect(screen.getByLabelText("释义组 1 中文名称")).toHaveValue(
      "失败后仍保留"
    );
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
    fireEvent.click(screen.getByText("词形与发音"));
    fireEvent.click(screen.getByText("释义与例句"));
    expect(await screen.findByLabelText("释义组 1 中文名称")).toHaveValue(
      "失败后仍保留"
    );
    fireEvent.click(screen.getByText("核对与发布"));
    expect(await screen.findByText("请先保存未保存的草稿")).toBeInTheDocument();
    expect(endpoints.validateV3).not.toHaveBeenCalled();
    expect(endpoints.previewFormsImpactV3).not.toHaveBeenCalled();
    expect(endpoints.publishV3).not.toHaveBeenCalled();
  });

  it("normalizes an unknown step to the server max reachable step", async () => {
    const current = word({ max_reachable_step: "forms" });
    const router = renderPage(
      `/words/${WORD_ID}/v3/wizard/not-a-step`,
      createV3WordRequests(source({ word: current, retired_stable_nodes: [] }))
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/words/${WORD_ID}/v3/wizard/forms`
      )
    );
  });
});
