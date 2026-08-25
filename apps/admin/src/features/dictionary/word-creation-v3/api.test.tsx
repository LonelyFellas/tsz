import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  AdminWordDraftAnyEnvelope,
  AdminWordDraftV3Envelope,
  AdminWordPublicationV3,
  AdminWordV3Envelope,
  CreateAdminWordV3Input,
  DetectLexiconSurfaceResponseV3,
  DraftMeaningsStepContentWritableV3,
  PublishAdminWordV3Input,
  SaveFormsStepInputV3,
  SaveMeaningsStepInputV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import { createV3WordRequests, type V3WordsApi } from "./api";

function endpointDoubles(): V3WordsApi {
  return {
    detectV3: vi.fn(),
    surfaceMatchSnapshotPageV3: vi.fn(),
    createV3: vi.fn(),
    getAny: vi.fn(),
    previewFormsImpactV3: vi.fn(),
    saveFormsStepV3: vi.fn(),
    saveMeaningsStepV3: vi.fn(),
    validateV3: vi.fn(),
    publishV3: vi.fn(),
    listPublications: vi.fn(),
    getPublication: vi.fn(),
    activatePublicationV3: vi.fn()
  } as unknown as V3WordsApi;
}

const WORD_ID = "019d2c55-1f9e-7f88-a189-a2b8a07153fb";
const OTHER_WORD_ID = "019d2c55-1f9e-7f88-a189-a2b8a07153fd";
const SNAPSHOT_ID = "019d2c55-1f9e-7f88-a189-a2b8a0715400";

function detectionResponse(
  request: DetectLexiconSurfaceResponseV3["request"] = {
    language: "en",
    kind: "word",
    surface: "colour"
  }
): DetectLexiconSurfaceResponseV3 {
  return {
    schema_version: 3,
    detection_id: "019d2c55-1f9e-7f88-a189-a2b8a0715401",
    expires_at: "2026-08-25T00:05:00Z",
    request,
    normalized_surface: "colour",
    builtin_dictionary: { status: "not_found" },
    matches: [],
    requires_acknowledgement: false
  };
}

function surfacePage(snapshotId = SNAPSHOT_ID): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: snapshotId,
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: [],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 1,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: "surface-token"
  };
}

function v3Draft(wordId = WORD_ID): AdminWordDraftV3Envelope {
  return {
    word: {
      schema_version: 3,
      id: wordId,
      language: "en",
      kind: "word",
      status: "draft",
      revision: 1,
      lifecycle_revision: 1,
      has_unpublished_changes: true,
      presentation: {
        label: "word",
        matched_surfaces: ["word"],
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
      created_by: "019d2c55-1f9e-7f88-a189-a2b8a07153fc",
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:00:00Z"
    },
    retired_stable_nodes: []
  };
}

function v3Publication(
  overrides: Partial<AdminWordPublicationV3> = {}
): AdminWordPublicationV3 {
  return {
    schema_version: 3,
    publication_id: "019d2c55-1f9e-7f88-a189-a2b8a07153fe",
    entry_id: WORD_ID,
    publication_number: 1,
    source_revision: 1,
    published_by_admin_id: "019d2c55-1f9e-7f88-a189-a2b8a07153fc",
    published_at: "2026-08-25T00:00:00Z",
    is_current: true,
    word: v3Draft().word,
    ...overrides
  };
}

describe("createV3WordRequests", () => {
  it("forwards every V3 wire request without translating snake_case fields", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    const canonical: AdminWordV3Envelope = { word: v3Draft().word };
    vi.mocked(endpoints.detectV3).mockResolvedValue(detectionResponse());
    vi.mocked(endpoints.surfaceMatchSnapshotPageV3).mockResolvedValue(
      surfacePage()
    );
    vi.mocked(endpoints.previewFormsImpactV3).mockResolvedValue({
      schema_version: 3,
      base_revision: 4,
      requires_confirmation: false,
      affected: []
    });
    vi.mocked(endpoints.saveFormsStepV3).mockResolvedValue(canonical);
    vi.mocked(endpoints.saveMeaningsStepV3).mockResolvedValue(canonical);
    vi.mocked(endpoints.validateV3).mockResolvedValue({
      schema_version: 3,
      validated_revision: 6,
      valid: true,
      issues: []
    });
    vi.mocked(endpoints.publishV3).mockResolvedValue(canonical);
    vi.mocked(endpoints.listPublications).mockResolvedValue({
      publications: []
    });
    vi.mocked(endpoints.getPublication).mockResolvedValue({
      publication: v3Publication()
    });
    vi.mocked(endpoints.activatePublicationV3).mockResolvedValue(canonical);
    const detectInput = {
      schema_version: 3,
      language: "en",
      kind: "word",
      surface: "colour"
    } as const;
    const createInput: CreateAdminWordV3Input = {
      schema_version: 3,
      detection_id: "detection-1",
      kind: "word",
      confirmed_surface_match_token: "surface-token"
    };
    const formsInput: SaveFormsStepInputV3 = {
      schema_version: 3,
      base_revision: 4,
      intent: "save",
      content: { pos: [] },
      confirmed_impact_token: "impact-token",
      confirmed_surface_match_token: "surface-token"
    };
    const meaningsInput: SaveMeaningsStepInputV3 = {
      schema_version: 3,
      base_revision: 5,
      intent: "complete",
      content: { sense_groups: [], pos: [] }
    };
    const publishInput: PublishAdminWordV3Input = {
      schema_version: 3,
      base_revision: 6,
      confirmed_surface_match_token: "surface-token-2"
    };

    await requests.detect(detectInput);
    await requests.surfacePage(SNAPSHOT_ID, "cursor-2");
    await requests.create("create-key", createInput);
    await requests.impact(WORD_ID, {
      schema_version: 3,
      base_revision: 4,
      content: { pos: [] }
    });
    await requests.saveForms(WORD_ID, formsInput);
    await requests.saveMeanings(WORD_ID, meaningsInput);
    await requests.validate(WORD_ID, {
      schema_version: 3,
      base_revision: 6
    });
    await requests.publish(WORD_ID, "publish-key", publishInput);
    await requests.listPublications(WORD_ID);
    await requests.getPublication(
      WORD_ID,
      "019d2c55-1f9e-7f88-a189-a2b8a07153fe"
    );
    await requests.activatePublication(
      WORD_ID,
      "019d2c55-1f9e-7f88-a189-a2b8a07153fe",
      "activate-key",
      {
        schema_version: 3,
        base_revision: 6,
        base_lifecycle_revision: 2
      }
    );

    expect(endpoints.detectV3).toHaveBeenCalledWith(detectInput);
    expect(endpoints.surfaceMatchSnapshotPageV3).toHaveBeenCalledWith(
      SNAPSHOT_ID,
      "cursor-2",
      undefined
    );
    expect(endpoints.createV3).toHaveBeenCalledWith("create-key", createInput);
    expect(endpoints.previewFormsImpactV3).toHaveBeenCalledWith(
      WORD_ID,
      expect.objectContaining({ schema_version: 3, base_revision: 4 })
    );
    expect(endpoints.saveFormsStepV3).toHaveBeenCalledWith(WORD_ID, formsInput);
    expect(endpoints.saveMeaningsStepV3).toHaveBeenCalledWith(
      WORD_ID,
      meaningsInput
    );
    expect(endpoints.validateV3).toHaveBeenCalledWith(WORD_ID, {
      schema_version: 3,
      base_revision: 6
    });
    expect(endpoints.publishV3).toHaveBeenCalledWith(
      WORD_ID,
      "publish-key",
      publishInput
    );
    expect(endpoints.listPublications).toHaveBeenCalledWith(WORD_ID);
    expect(endpoints.getPublication).toHaveBeenCalledWith(
      WORD_ID,
      "019d2c55-1f9e-7f88-a189-a2b8a07153fe"
    );
    expect(endpoints.activatePublicationV3).toHaveBeenCalledWith(
      WORD_ID,
      "019d2c55-1f9e-7f88-a189-a2b8a07153fe",
      "activate-key",
      {
        schema_version: 3,
        base_revision: 6,
        base_lifecycle_revision: 2
      }
    );

    expectTypeOf(
      meaningsInput.content
    ).toEqualTypeOf<DraftMeaningsStepContentWritableV3>();
  });

  it.each([
    {
      label: "language",
      request: { language: "fr", kind: "word", surface: "colour" },
      responsePath: "detect.request.language"
    },
    {
      label: "kind",
      request: { language: "en", kind: "phrase", surface: "colour" },
      responsePath: "detect.request.kind"
    },
    {
      label: "surface",
      request: { language: "en", kind: "word", surface: "color" },
      responsePath: "detect.request.surface"
    }
  ] as const)(
    "rejects a detect response whose echoed $label differs from the request",
    async ({ request, responsePath }) => {
      const endpoints = endpointDoubles();
      const requests = createV3WordRequests(endpoints);
      vi.mocked(endpoints.detectV3).mockResolvedValue(
        detectionResponse(
          request as unknown as DetectLexiconSurfaceResponseV3["request"]
        )
      );

      await expect(
        requests.detect({
          schema_version: 3,
          language: "en",
          kind: "word",
          surface: "colour"
        })
      ).rejects.toMatchObject({
        name: "InvalidAdminWordResponseError",
        response_path: responsePath,
        reason: "enum_mismatch",
        received_type: "string"
      });
    }
  );

  it("rejects a surface page whose snapshot identity differs from the path", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    vi.mocked(endpoints.surfaceMatchSnapshotPageV3).mockResolvedValue(
      surfacePage("019d2c55-1f9e-7f88-a189-a2b8a0715402")
    );

    await expect(
      requests.surfacePage(SNAPSHOT_ID, "cursor-1")
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "surface_page.snapshot_id",
      reason: "enum_mismatch",
      received_type: "string"
    });
  });

  it("rejects an impact response whose base revision differs from the request", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    vi.mocked(endpoints.previewFormsImpactV3).mockResolvedValue({
      schema_version: 3,
      base_revision: 3,
      requires_confirmation: false,
      affected: []
    });

    await expect(
      requests.impact(WORD_ID, {
        schema_version: 3,
        base_revision: 2,
        content: { pos: [] }
      })
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "impact.base_revision",
      reason: "enum_mismatch",
      received_type: "number"
    });
  });

  it("rejects a validation response whose validated revision differs from the request", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    vi.mocked(endpoints.validateV3).mockResolvedValue({
      schema_version: 3,
      validated_revision: 3,
      valid: true,
      issues: []
    });

    await expect(
      requests.validate(WORD_ID, { schema_version: 3, base_revision: 2 })
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "validate.validated_revision",
      reason: "enum_mismatch",
      received_type: "number"
    });
  });

  it("narrows getAny to a V3 draft and rejects a legacy response", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    const v3 = v3Draft();
    vi.mocked(endpoints.getAny).mockResolvedValueOnce(v3);

    await expect(requests.get(WORD_ID)).resolves.toBe(v3);

    vi.mocked(endpoints.getAny).mockResolvedValueOnce({
      word: { schema_version: 2, id: "word-2" },
      retired_stable_slots: []
    } as unknown as AdminWordDraftAnyEnvelope);
    await expect(requests.get("word-2")).rejects.toMatchObject({
      name: "UnsupportedAdminWordSchemaVersionError",
      received_schema_version: 2
    });

    vi.mocked(endpoints.getAny).mockResolvedValueOnce({
      word: { schema_version: 3, id: "malformed" },
      retired_stable_nodes: []
    } as unknown as AdminWordDraftV3Envelope);
    await expect(requests.get("malformed")).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError"
    });
  });

  it("rejects canonical command responses whose word identity differs from the path", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    const mismatched = { word: v3Draft(OTHER_WORD_ID).word };
    const formsInput: SaveFormsStepInputV3 = {
      schema_version: 3,
      base_revision: 1,
      intent: "save",
      content: { pos: [] }
    };
    const meaningsInput: SaveMeaningsStepInputV3 = {
      schema_version: 3,
      base_revision: 1,
      intent: "save",
      content: { sense_groups: [], pos: [] }
    };
    vi.mocked(endpoints.getAny).mockResolvedValue(v3Draft(OTHER_WORD_ID));
    vi.mocked(endpoints.saveFormsStepV3).mockResolvedValue(mismatched);
    vi.mocked(endpoints.saveMeaningsStepV3).mockResolvedValue(mismatched);
    vi.mocked(endpoints.publishV3).mockResolvedValue(mismatched);
    vi.mocked(endpoints.activatePublicationV3).mockResolvedValue(mismatched);

    await expect(requests.get(WORD_ID)).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "get.word.id"
    });
    await expect(requests.saveForms(WORD_ID, formsInput)).rejects.toMatchObject(
      {
        name: "InvalidAdminWordResponseError",
        response_path: "save_forms.word.id"
      }
    );
    await expect(
      requests.saveMeanings(WORD_ID, meaningsInput)
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "save_meanings.word.id"
    });
    await expect(
      requests.publish(WORD_ID, "publish-key", {
        schema_version: 3,
        base_revision: 1
      })
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "publish.word.id"
    });
    await expect(
      requests.activatePublication(
        WORD_ID,
        "019d2c55-1f9e-7f88-a189-a2b8a07153fe",
        "activation-key",
        {
          schema_version: 3,
          base_revision: 1,
          base_lifecycle_revision: 1
        }
      )
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "activate_publication.word.id"
    });
  });

  it("rejects publication responses whose entry, embedded word, or publication identity differs from the path", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    vi.mocked(endpoints.listPublications).mockResolvedValueOnce({
      publications: [v3Publication({ entry_id: OTHER_WORD_ID })]
    });

    await expect(requests.listPublications(WORD_ID)).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "publications[0].entry_id"
    });

    vi.mocked(endpoints.getPublication).mockResolvedValueOnce({
      publication: v3Publication({ word: v3Draft(OTHER_WORD_ID).word })
    });
    await expect(
      requests.getPublication(WORD_ID, "019d2c55-1f9e-7f88-a189-a2b8a07153fe")
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "publication.word.id"
    });

    vi.mocked(endpoints.getPublication).mockResolvedValueOnce({
      publication: v3Publication({
        publication_id: "019d2c55-1f9e-7f88-a189-a2b8a07153ff"
      })
    });
    await expect(
      requests.getPublication(WORD_ID, "019d2c55-1f9e-7f88-a189-a2b8a07153fe")
    ).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "publication.publication_id"
    });
  });

  it("keeps the V3 meanings write body free of response-only bridge projections", () => {
    type Sentence =
      SaveMeaningsStepInputV3["content"]["pos"][number]["senses"][number]["sentences"][number];
    type Relation =
      SaveMeaningsStepInputV3["content"]["pos"][number]["senses"][number]["relations"][number];

    expectTypeOf<Sentence>().not.toHaveProperty("associations");
    expectTypeOf<Sentence>().not.toHaveProperty("associations_state");
    expectTypeOf<Relation>().not.toHaveProperty("target_headword");
    expectTypeOf<Relation>().not.toHaveProperty("target_gloss");
  });

  it("forwards AbortSignal to surface transport without converting cancellation", async () => {
    const endpoints = endpointDoubles();
    const requests = createV3WordRequests(endpoints);
    const controller = new AbortController();
    const aborted = new DOMException("cancelled", "AbortError");
    vi.mocked(endpoints.surfaceMatchSnapshotPageV3).mockRejectedValue(aborted);

    const pending = requests.surfacePage(
      "snapshot-1",
      "cursor-1",
      controller.signal
    );
    controller.abort();

    await expect(pending).rejects.toBe(aborted);
    expect(endpoints.surfaceMatchSnapshotPageV3).toHaveBeenCalledWith(
      "snapshot-1",
      "cursor-1",
      controller.signal
    );
  });
});
