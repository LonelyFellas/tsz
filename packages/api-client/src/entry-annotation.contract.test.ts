import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminEndpoints } from "./admin";
import { createHttpClient, HttpError } from "./http";
import { decodeEntryAnnotationResponse } from "./admin-word-schema";
import snapshot from "./openapi.snapshot.json";

const id = "018f47b8-e3c1-7bd1-9f0a-123456789aa1";
const conflict = {
  reason: "required",
  entries: [
    {
      entry_id: id,
      annotation: null,
      annotation_revision: 1,
      presentation: {
        label: "center",
        matched_surfaces: ["center"],
        strategy_version: "surface_summary_v1"
      },
      pos_labels: ["名词"],
      gloss_previews: ["中心"],
      updated_at: "2026-09-06T00:00:00Z",
      inbound_relations: {
        total: 0,
        by_type: { synonym: 0, antonym: 0, derivative: 0 },
        previews: [],
        truncated: false
      }
    }
  ],
  groups: [
    { dialect_scope: "us", normalized_surface: "center", entry_ids: [id] }
  ]
};

afterEach(() => vi.unstubAllGlobals());

describe("词条标注 wire 契约", () => {
  it("PATCH来自权威OpenAPI，发送snake_case修订并解码响应", async () => {
    const response = {
      entry_id: id,
      annotation: "中心",
      annotation_revision: 2
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(response), { status: 200 })
      );
    vi.stubGlobal("fetch", fetch);
    const api = createAdminEndpoints(
      createHttpClient({ baseUrl: "/api/v1/admin" })
    );
    await expect(
      api.words.updateAnnotation(id, {
        annotation: "中心",
        base_annotation_revision: 1
      })
    ).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/admin/lexicon/entries/${id}/annotation`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          annotation: "中心",
          base_annotation_revision: 1
        })
      })
    );
    const path = Object.keys(snapshot.paths).find((path) =>
      path.endsWith("/annotation")
    );
    expect(path).toBeDefined();
    const operation = (
      snapshot.operationSchemas as Record<
        string,
        { request: unknown; responses: Record<string, unknown> }
      >
    )[`patch ${path}`]!;
    expect(operation.request).toEqual({
      $ref: "#/components/schemas/UpdateEntryAnnotationInput"
    });
    expect(operation.responses["200"]).toEqual({
      $ref: "#/components/schemas/EntryAnnotationResponse"
    });
    expect(() =>
      decodeEntryAnnotationResponse({ ...response, annotation_revision: 0 })
    ).toThrow();
  });

  it("真实HTTP 409保留完整分组供UI，不将结构化冲突吞为普通错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "https://example.test/problems/annotation_conflict",
            title: "Annotation conflict",
            status: 409,
            detail: "annotation conflict",
            code: "annotation_conflict",
            meta: { annotation_conflict: conflict }
          }),
          { status: 409 }
        )
      )
    );
    const api = createAdminEndpoints(
      createHttpClient({ baseUrl: "/api/v1/admin" })
    );
    try {
      await api.words.createV3(id, {
        schema_version: 3,
        detection_id: id,
        kind: "word",
        annotation: "中心",
        annotation_updates: [
          { entry_id: id, annotation: "中锋", base_annotation_revision: 1 }
        ]
      });
      throw new Error("Expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).meta?.annotation_conflict).toEqual(conflict);
    }
  });
});
