import { HttpError } from "@tsz/api-client";
import type {
  AdminWordV3,
  AdminWordV3Envelope,
  DraftFormsStepContentV3,
  FormsImpactResponseV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { createV3SaveFlow, formsContentDigest } from "./saveFlow";

function word(
  revision: number,
  presentation = `word-${revision}`
): AdminWordV3 {
  return {
    schema_version: 3,
    id: "word-1",
    language: "en",
    kind: "word",
    status: "draft",
    revision,
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: presentation,
      matched_surfaces: [presentation],
      strategy_version: "v3"
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

function envelope(
  revision: number,
  presentation?: string
): AdminWordV3Envelope {
  return { word: word(revision, presentation) };
}

function terminalSurfacePage(impactToken?: string): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "snapshot-1",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 7,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: "surface-token",
    ...(impactToken ? { impact_confirmation_token: impactToken } : {})
  };
}

function firstSurfacePage(): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "snapshot-1",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 7,
    continuation_policy: "enabled",
    next_cursor: "cursor-2"
  };
}

describe("createV3SaveFlow", () => {
  it("replaces canonical state with the accepted server response and revision", async () => {
    const flow = createV3SaveFlow(word(1));
    const response = envelope(2, "canonical spelling");

    const result = await flow.runCanonical("save_forms", () =>
      Promise.resolve(response)
    );

    expect(result).toEqual({ accepted: true, value: response });
    expect(flow.canonical()).toBe(response.word);
    expect(flow.canonical()).toMatchObject({
      revision: 2,
      presentation: { label: "canonical spelling" }
    });
  });

  it.each(["save_forms", "publish"] as const)(
    "uses a synchronous single-flight lock for %s and permits retry after settlement",
    async (command) => {
      const flow = createV3SaveFlow(word(1));
      let resolve!: (value: AdminWordV3Envelope) => void;
      const request = vi.fn(
        () =>
          new Promise<AdminWordV3Envelope>((done) => {
            resolve = done;
          })
      );

      const first = flow.runCanonical(command, request);
      const second = flow.runCanonical(command, request);
      expect(first).toBe(second);
      expect(request).toHaveBeenCalledTimes(1);

      resolve(envelope(2));
      await first;
      await flow.runCanonical(command, () => Promise.resolve(envelope(3)));
      expect(flow.canonical().revision).toBe(3);
    }
  );

  it("single-flights impact and returns the actual impact response shape", async () => {
    const flow = createV3SaveFlow(word(1));
    const impact: FormsImpactResponseV3 = {
      schema_version: 3,
      base_revision: 1,
      requires_confirmation: false,
      affected: [
        {
          node_id: "relation-1",
          node_type: "relation",
          reason: "form deletion would leave a relation reference"
        }
      ]
    };
    const request = vi.fn(() => Promise.resolve(impact));

    const first = flow.runRequest("impact", request);
    const second = flow.runRequest("impact", request);

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ accepted: true, value: impact });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("single-flights validate and marks its response stale after supersede", async () => {
    const flow = createV3SaveFlow(word(1));
    let resolve!: (value: { valid: boolean }) => void;
    const request = vi.fn(
      () =>
        new Promise<{ valid: boolean }>((done) => {
          resolve = done;
        })
    );

    const first = flow.runRequest("validate", request);
    const second = flow.runRequest("validate", request);
    expect(first).toBe(second);
    expect(request).toHaveBeenCalledTimes(1);

    flow.supersede();
    resolve({ valid: true });
    await expect(first).resolves.toEqual({
      accepted: false,
      value: { valid: true }
    });

    let resolveDisposed!: (value: { valid: boolean }) => void;
    const disposed = flow.runRequest(
      "validate",
      () =>
        new Promise<{ valid: boolean }>((done) => {
          resolveDisposed = done;
        })
    );
    flow.dispose();
    resolveDisposed({ valid: false });
    await expect(disposed).resolves.toMatchObject({ accepted: false });
  });

  it("does not accept a response superseded by a route/POS generation change", async () => {
    const flow = createV3SaveFlow(word(1));
    let resolve!: (value: AdminWordV3Envelope) => void;
    const pending = flow.runCanonical(
      "save_meanings",
      () =>
        new Promise<AdminWordV3Envelope>((done) => {
          resolve = done;
        })
    );

    flow.supersede();
    resolve(envelope(2));

    await expect(pending).resolves.toMatchObject({ accepted: false });
    expect(flow.canonical().revision).toBe(1);
  });

  it("marks a stale surface response unaccepted after supersede", async () => {
    const flow = createV3SaveFlow(word(1));
    let resolve!: (value: SurfaceMatchPageV3) => void;
    const pending = flow.runRequest(
      "surface",
      () =>
        new Promise<SurfaceMatchPageV3>((done) => {
          resolve = done;
        })
    );

    flow.supersede();
    resolve(terminalSurfacePage());

    await expect(pending).resolves.toMatchObject({ accepted: false });
  });

  it("does not accept a response after disposal", async () => {
    const flow = createV3SaveFlow(word(1));
    let resolve!: (value: AdminWordV3Envelope) => void;
    const pending = flow.runCanonical(
      "save_forms",
      () =>
        new Promise<AdminWordV3Envelope>((done) => {
          resolve = done;
        })
    );

    flow.dispose();
    resolve(envelope(2));

    await expect(pending).resolves.toMatchObject({ accepted: false });
    expect(flow.canonical().revision).toBe(1);
  });

  it("lets a superseding surface request start and ignores the old error", async () => {
    const flow = createV3SaveFlow(word(1));
    const previewContent = { pos: [] };
    let rejectOld!: (error: unknown) => void;
    const oldRequest = flow.runRequest(
      "surface",
      () =>
        new Promise<SurfaceMatchPageV3>((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    flow.supersede();

    const currentRequest = vi.fn(() => Promise.resolve(terminalSurfacePage()));
    const current = await flow.runRequest("surface", currentRequest);
    expect(current).toMatchObject({ accepted: true });
    expect(currentRequest).toHaveBeenCalledTimes(1);
    flow.bindSurfaceConfirmation(current.value, previewContent);

    rejectOld(new HttpError(409, "changed", [], "surface_policy_changed"));
    await expect(oldRequest).rejects.toBeInstanceOf(HttpError);
    expect(
      flow.confirmations({
        base_revision: 1,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        impact_content: previewContent
      })
    ).toEqual({ confirmed_surface_match_token: "surface-token" });
  });

  it("keeps canonical state on network/500 failure and releases the button lock", async () => {
    const flow = createV3SaveFlow(word(4));
    await expect(
      flow.runCanonical("save_forms", () =>
        Promise.reject(new HttpError(500, "failed", [], "internal_error"))
      )
    ).rejects.toMatchObject({ status: 500 });
    expect(flow.canonical().revision).toBe(4);
    expect(flow.isPending("save_forms")).toBe(false);

    await flow.runCanonical("save_forms", () => Promise.resolve(envelope(5)));
    expect(flow.canonical().revision).toBe(5);
  });

  it("binds confirmation tokens to revision, snapshot identity, and policy epoch", () => {
    const flow = createV3SaveFlow(word(8));
    const page = terminalSurfacePage("page-impact-token");
    const previewContent = { pos: [] };
    const impact: FormsImpactResponseV3 = {
      schema_version: 3,
      base_revision: 8,
      requires_confirmation: true,
      affected: [],
      confirmation_token: undefined,
      surface_match_page: page
    };

    expect(flow.bindSurfaceConfirmation(page, previewContent)).toBe(true);
    expect(flow.bindImpactConfirmation(impact, previewContent)).toBe(true);
    expect(
      flow.confirmations({
        base_revision: 8,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        impact_content: previewContent
      })
    ).toEqual({
      confirmed_surface_match_token: "surface-token",
      confirmed_impact_token: "page-impact-token"
    });
    expect(
      flow.confirmations({
        base_revision: 8,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 8,
        impact_content: previewContent
      })
    ).toEqual({ confirmed_impact_token: "page-impact-token" });
  });

  it("binds paginated terminal surface and impact tokens to the original preview content", () => {
    const flow = createV3SaveFlow(word(8));
    const previewContent: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const impact: FormsImpactResponseV3 = {
      schema_version: 3,
      base_revision: 8,
      requires_confirmation: true,
      affected: [],
      surface_match_page: firstSurfacePage()
    };

    expect(flow.bindImpactConfirmation(impact, previewContent)).toBe(false);
    expect(
      flow.bindImpactSurfaceConfirmation(
        terminalSurfacePage("terminal-impact-token")
      )
    ).toBe(true);
    expect(
      flow.confirmations({
        base_revision: 8,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        impact_content: previewContent
      })
    ).toEqual({
      confirmed_surface_match_token: "surface-token",
      confirmed_impact_token: "terminal-impact-token"
    });
  });

  it("does not reuse a surface token for changed forms content", () => {
    const flow = createV3SaveFlow(word(8));
    const previewContent: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const changedContent: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "verb",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };

    expect(
      flow.bindSurfaceConfirmation(terminalSurfacePage(), previewContent)
    ).toBe(true);
    expect(
      flow.confirmations({
        base_revision: 8,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        impact_content: changedContent
      })
    ).toEqual({});
  });

  it("clears an old surface token when a new impact preview has no surface page", async () => {
    const flow = createV3SaveFlow(word(8));
    const content = { pos: [] };
    flow.bindSurfaceConfirmation(terminalSurfacePage(), content);

    await flow.runRequest("impact", () =>
      Promise.resolve({
        schema_version: 3 as const,
        base_revision: 8,
        requires_confirmation: false,
        affected: []
      })
    );
    expect(
      flow.confirmations({
        base_revision: 8,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        impact_content: content
      })
    ).toEqual({});
  });

  it("uses a stable content digest and never reuses an impact token after content changes", () => {
    const flow = createV3SaveFlow(word(8));
    const previewContent: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const sameContentDifferentKeyOrder: DraftFormsStepContentV3 = {
      pos: [
        {
          form_groups: [],
          forms: [],
          dialect_rules: {
            phonetic_mode: "unified",
            spelling_mode: "unified"
          },
          pos: "noun",
          pos_id: "pos-1"
        }
      ]
    };
    const changedContent: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: "pos-1",
          pos: "verb",
          dialect_rules: {
            spelling_mode: "unified",
            phonetic_mode: "unified"
          },
          forms: [],
          form_groups: []
        }
      ]
    };
    const impact: FormsImpactResponseV3 = {
      schema_version: 3,
      base_revision: 8,
      requires_confirmation: true,
      affected: [],
      confirmation_token: "impact-token"
    };

    expect(formsContentDigest(previewContent)).toBe(
      formsContentDigest(sameContentDifferentKeyOrder)
    );
    expect(formsContentDigest(previewContent)).not.toBe(
      formsContentDigest(changedContent)
    );
    expect(flow.bindImpactConfirmation(impact, previewContent)).toBe(true);
    expect(
      flow.confirmations({ base_revision: 8, impact_content: changedContent })
    ).toEqual({});
    expect(
      flow.confirmations({
        base_revision: 8,
        impact_content: sameContentDifferentKeyOrder
      })
    ).toEqual({ confirmed_impact_token: "impact-token" });
  });

  it("does not substitute a top-level impact token when a surface page omits its bound token", () => {
    const flow = createV3SaveFlow(word(8));
    const content = { pos: [] };

    expect(
      flow.bindImpactConfirmation(
        {
          schema_version: 3,
          base_revision: 8,
          requires_confirmation: true,
          affected: [],
          confirmation_token: "wrong-source-token",
          surface_match_page: terminalSurfacePage()
        },
        content
      )
    ).toBe(false);
    expect(
      flow.confirmations({
        base_revision: 8,
        snapshot_id: "snapshot-1",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        impact_content: content
      })
    ).toEqual({ confirmed_surface_match_token: "surface-token" });
  });

  it("clears the old impact token when preview starts or needs no confirmation", async () => {
    const flow = createV3SaveFlow(word(8));
    const content = { pos: [] };
    flow.bindImpactConfirmation(
      {
        schema_version: 3,
        base_revision: 8,
        requires_confirmation: true,
        affected: [],
        confirmation_token: "old-token"
      },
      content
    );

    await flow.runRequest("impact", () =>
      Promise.resolve({
        schema_version: 3 as const,
        base_revision: 8,
        requires_confirmation: false,
        affected: []
      })
    );
    expect(
      flow.confirmations({ base_revision: 8, impact_content: content })
    ).toEqual({});

    expect(
      flow.bindImpactConfirmation(
        {
          schema_version: 3,
          base_revision: 8,
          requires_confirmation: false,
          affected: []
        },
        content
      )
    ).toBe(false);
    expect(
      flow.confirmations({ base_revision: 8, impact_content: content })
    ).toEqual({});
  });

  it("rejects old-revision impact tokens and invalidates tokens after conflict/canonical save", async () => {
    const flow = createV3SaveFlow(word(8));
    expect(
      flow.bindImpactConfirmation(
        {
          schema_version: 3,
          base_revision: 7,
          requires_confirmation: true,
          affected: [],
          confirmation_token: "old-impact-token"
        },
        { pos: [] }
      )
    ).toBe(false);

    flow.bindSurfaceConfirmation(terminalSurfacePage(), { pos: [] });
    await expect(
      flow.runCanonical("publish", () =>
        Promise.reject(
          new HttpError(409, "changed", [], "surface_policy_changed")
        )
      )
    ).rejects.toBeInstanceOf(HttpError);
    expect(flow.confirmations()).toEqual({});

    flow.bindSurfaceConfirmation(terminalSurfacePage(), { pos: [] });
    await flow.runCanonical("save_forms", () => Promise.resolve(envelope(9)));
    expect(flow.confirmations()).toEqual({});
  });

  it("invalidates impact binding when save requires a new downstream preview", async () => {
    const flow = createV3SaveFlow(word(8));
    const content = { pos: [] };
    flow.bindImpactConfirmation(
      {
        schema_version: 3,
        base_revision: 8,
        requires_confirmation: true,
        affected: [],
        confirmation_token: "impact-token"
      },
      content
    );

    await expect(
      flow.runCanonical("save_forms", () =>
        Promise.reject(
          new HttpError(
            409,
            "preview again",
            [],
            "downstream_confirmation_required"
          )
        )
      )
    ).rejects.toBeInstanceOf(HttpError);
    expect(
      flow.confirmations({ base_revision: 8, impact_content: content })
    ).toEqual({});
  });
});
