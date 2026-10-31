import { describe, expect, it, vi } from "vitest";
import { decodeDubbingGroupsV3 } from "./dubbing-groups-v3";
import { createAdminEndpoints } from "./admin";
import type { HttpClient } from "./http";
import spec from "./openapi.snapshot.json";

describe("音色库契约", () => {
  it("音频任务持久查询、撤销和重试声明权限与冲突边界", () => {
    for (const operation of [
      "get /admin/speech/audio-updates",
      "get /admin/speech/groups/{id}/audio-updates"
    ] as const) {
      expect(spec.operationSchemas[operation].responses).toHaveProperty("403");
    }
    for (const operation of [
      "post /admin/speech/audio-updates/{id}/cancel",
      "post /admin/speech/audio-updates/{id}/retry"
    ] as const) {
      expect(spec.operationSchemas[operation].responses).toHaveProperty("409");
      expect(spec.operationSchemas[operation].responses).toHaveProperty("404");
    }
    expect(spec.schemas.DubbingAudioUpdate.required).toEqual(
      expect.arrayContaining([
        "group_name",
        "state",
        "due_at",
        "failed",
        "skipped"
      ])
    );
    expect(spec.schemas.SaveDubbingUpdateSettings.additionalProperties).toBe(
      false
    );
    expect(spec.schemas.SaveDubbingUpdateSettings.required).toEqual([
      "wait_seconds",
      "base_revision"
    ]);
    expect(spec.schemas.DubbingUpdateSettings.properties).not.toHaveProperty(
      "enabled"
    );
    expect(
      spec.schemas.SaveDubbingUpdateSettings.properties
    ).not.toHaveProperty("enabled");
  });
  it("模型能力可省略以读取旧目录，Flash禁用能力由真实目录返回", () => {
    for (const name of [
      "supports_volume_percent",
      "supports_pause",
      "supports_phoneme"
    ] as const) {
      expect(spec.schemas.VoiceCapabilities.required).not.toContain(name);
      expect(spec.schemas.VoiceCapabilities.properties[name]).toMatchObject({
        type: "boolean"
      });
    }
  });
  it("只读目录资料可省略，未知值与明确空角色分开，不改变试听能力", () => {
    expect(spec.schemas.VoiceResponse.required).not.toContain("metadata");
    expect(spec.schemas.VoiceMetadata.required).toEqual([
      "provider_voice_id",
      "model",
      "source_url",
      "checked_at"
    ]);
    expect(spec.schemas.VoiceMetadata.properties.age_group.type).toContain(
      "null"
    );
    expect(spec.schemas.VoiceMetadata.properties.roles.type).toContain("null");
    expect(spec.schemas.VoiceMetadata.properties.roles.items).toEqual({
      type: "string"
    });
    expect(spec.schemas.VoiceCapabilities.properties).not.toHaveProperty(
      "roles"
    );
    expect(spec.schemas.CreatePreviewRequest.properties).not.toHaveProperty(
      "model"
    );
  });
  it("个人写入不接受账号归属，保存声明版本冲突", () => {
    const schema = spec.schemas.SaveVoiceSettingsRequest;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "base_revision",
      "notes",
      "parameters"
    ]);
    expect(schema.required).toEqual(
      expect.arrayContaining(["base_revision", "notes"])
    );
    const operation =
      spec.operationSchemas["put /admin/speech/library/{alias}/personal"];
    expect(operation.request).toEqual({
      $ref: "#/components/schemas/SaveVoiceSettingsRequest"
    });
    expect(operation.responses).toHaveProperty("409");
    expect(operation.responses).toHaveProperty("403");
  });

  it("共享介绍和个人设置分别有版本，资料不返回管理员身份", () => {
    expect(
      Object.keys(spec.schemas.VoiceLibraryItem.properties).sort()
    ).toEqual([
      "accent",
      "accent_revision",
      "description_revision",
      "description_zh",
      "notes",
      "parameters",
      "personal_revision",
      "voice_alias"
    ]);
    expect(
      spec.operationSchemas["put /admin/speech/library/{alias}/description"]
        .responses
    ).toHaveProperty("409");
  });

  it("当前归属独立于原始 locale，并按修订号恢复资料", () => {
    expect(spec.schemas.VoiceAccent.enum).toEqual(["gb", "us", "none"]);
    for (const key of [
      "put /admin/speech/library/{alias}/accent",
      "post /admin/speech/library/{alias}/description/restore"
    ] as const) {
      expect(spec.operationSchemas[key].responses).toHaveProperty("409");
      expect(spec.operationSchemas[key].responses).toHaveProperty("403");
    }
    expect(spec.schemas.VoiceResponse.required).not.toContain("accent");
    expect(
      spec.schemas.VoiceCapabilityEvidence.properties.supported_locales.type
    ).toContain("null");
    expect(
      spec.schemas.VoiceCapabilityEvidence.properties.supports_style_degree.type
    ).toContain("null");
    expect(
      spec.schemas.CreatePreviewRequest.properties.style_degree
    ).toMatchObject({ minimum: 0.01, maximum: 2 });
  });

  it("单组保存和删除携带组版本，旧整体写入有冲突保护", () => {
    expect(spec.paths["/admin/speech/groups"]).toEqual(["get", "post", "put"]);
    expect(spec.paths["/admin/speech/groups/{id}"]).toEqual(["delete", "put"]);
    expect(spec.schemas.SaveDubbingGroupRequest.required).toEqual([
      "group",
      "base_revision"
    ]);
    expect(spec.schemas.DeleteDubbingGroupRequest.required).toEqual([
      "base_revision"
    ]);
    expect(
      spec.operationSchemas["put /admin/speech/groups/{id}"].responses
    ).toHaveProperty("409");
    expect(
      spec.operationSchemas["delete /admin/speech/groups/{id}"].responses
    ).toHaveProperty("409");
    expect(spec.schemas.SaveDubbingGroupsRequest.required).toEqual([
      "groups",
      "base_revision"
    ]);
    expect(spec.schemas.DubbingGroup.required).toEqual([
      "id",
      "name",
      "areas",
      "uk",
      "us"
    ]);
    expect(
      spec.operationSchemas["put /admin/speech/groups"].responses
    ).toHaveProperty("409");
  });
});

const groupId = "018f47b8-e3c1-7bd1-9f0a-123456789aa1";
const pairId = "018f47b8-e3c1-7bd1-9f0a-123456789aa2";
const ukId = "018f47b8-e3c1-7bd1-9f0a-123456789aa3";
const usId = "018f47b8-e3c1-7bd1-9f0a-123456789aa4";
function pairedGroups() {
  return {
    revision: 2,
    order_revision: 1,
    groups: [
      {
        id: groupId,
        name: "配对组",
        areas: ["word"],
        revision: 1,
        is_global: false,
        recommendations: {
          format: "paired" as const,
          pairs: [
            {
              id: pairId,
              name: "第一套",
              selected: false,
              uk: {
                id: ukId,
                voice_alias: "en-gb-sonianeural",
                parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
              },
              us: {
                id: usId,
                voice_alias: "en-us-jennyneural",
                parameters: {
                  rate_percent: 10,
                  pitch_semitones: 0,
                  style: null
                }
              }
            }
          ]
        }
      }
    ]
  };
}

describe("配对推荐 v3 契约", () => {
  it("复用路径显式协商，写入及返回同时声明两种表示", () => {
    for (const operation of [
      "get /admin/speech/groups",
      "post /admin/speech/groups",
      "put /admin/speech/groups/{id}",
      "delete /admin/speech/groups/{id}"
    ] as const) {
      expect(spec.operationHeaders[operation]).toContainEqual({
        name: "X-TSZ-Dubbing-Groups",
        in: "header",
        required: false,
        schema: { type: ["string", "null"] }
      });
      expect(spec.operationSchemas[operation].responses["200"]).toEqual({
        $ref: "#/components/schemas/DubbingGroupsReadResponse"
      });
    }
    expect(spec.schemas.DubbingGroupsReadResponse.oneOf).toEqual([
      { $ref: "#/components/schemas/DubbingGroupsResponse" },
      { $ref: "#/components/schemas/DubbingGroupsV3Response" }
    ]);
    expect(spec.schemas.DubbingGroupsV3Response.required).toContain(
      "order_revision"
    );
    expect(spec.schemas.DubbingPairVoice.required).toEqual([
      "id",
      "voice_alias",
      "parameters"
    ]);
    expect(spec.schemas.DubbingPairVoice.additionalProperties).toBe(false);
  });

  it("严格解析完整套和未猜配历史列表，保留同声多参数及不等长数据", () => {
    const paired = pairedGroups();
    expect(decodeDubbingGroupsV3(paired)).toBe(paired);
    const side = paired.groups[0]!.recommendations.pairs[0]!.uk;
    const legacy = {
      ...paired,
      groups: [
        {
          ...paired.groups[0],
          recommendations: {
            format: "legacy",
            uk: [
              { ...side, name: "同名", selected: false },
              {
                ...side,
                id: usId,
                name: "同名",
                selected: true,
                parameters: { ...side.parameters, rate_percent: 20 }
              }
            ],
            us: []
          }
        }
      ]
    };
    expect(decodeDubbingGroupsV3(legacy)).toBe(legacy);
  });

  it("拒绝旧服务响应、缺失侧、未知字段与未知格式，不默默退回 v2", () => {
    const malformed: unknown[] = [];
    for (const path of [
      ["order_revision"],
      ["groups", 0, "recommendations", "pairs", 0, "us"],
      ["groups", 0, "recommendations", "pairs", 0, "selected"]
    ]) {
      const value = structuredClone(pairedGroups());
      let parent: unknown = value;
      for (const key of path.slice(0, -1))
        parent = (parent as Record<string, unknown>)[key];
      delete (parent as Record<string, unknown>)[path.at(-1)!];
      malformed.push(value);
    }
    const paired = pairedGroups();
    malformed.push(
      { ...paired, order_revision: -1 },
      {
        ...paired,
        groups: [
          {
            ...paired.groups[0],
            recommendations: { format: "guessed", pairs: [] }
          }
        ]
      },
      {
        ...paired,
        groups: [
          {
            ...paired.groups[0],
            recommendations: { ...paired.groups[0]!.recommendations, uk: [] }
          }
        ]
      },
      {
        ...paired,
        groups: [
          {
            ...paired.groups[0],
            recommendations: {
              format: "paired",
              pairs: [
                {
                  ...paired.groups[0]!.recommendations.pairs[0],
                  uk: {
                    ...paired.groups[0]!.recommendations.pairs[0]!.uk,
                    extra: true
                  }
                }
              ]
            }
          }
        ]
      }
    );
    for (const value of malformed) {
      expect(() => decodeDubbingGroupsV3(value)).toThrow(
        "配对推荐响应不符合接口契约"
      );
    }
    expect(() => decodeDubbingGroupsV3({ groups: [], revision: 1 })).toThrow();
  });

  it("v3 方法单独发送请求和严格解析，现有 v2 调用保持原样", async () => {
    const value = pairedGroups();
    const http = {
      get: vi.fn().mockResolvedValue(value),
      post: vi.fn().mockResolvedValue(value),
      put: vi.fn().mockResolvedValue(value),
      del: vi.fn().mockResolvedValue(value)
    };
    const endpoints = createAdminEndpoints(
      http as unknown as HttpClient
    ).speech;
    const headers = {
      "X-TSZ-Voice-Models": "v1",
      "X-TSZ-Dubbing-Groups": "v3"
    };
    await expect(endpoints.groupsV3()).resolves.toBe(value);
    expect(http.get).toHaveBeenLastCalledWith("/speech/groups", { headers });
    const input = {
      base_revision: 1,
      group: {
        id: groupId,
        name: "配对组",
        areas: [],
        is_global: false,
        pairs: value.groups[0]!.recommendations.pairs
      }
    };
    await endpoints.savePairedGroup(input, true);
    expect(http.post).toHaveBeenLastCalledWith("/speech/groups", input, {
      headers
    });
    await endpoints.savePairedGroup(input);
    expect(http.put).toHaveBeenLastCalledWith(
      `/speech/groups/${groupId}`,
      input,
      { headers }
    );
    await endpoints.deleteGroupV3(groupId, 1);
    expect(http.del).toHaveBeenLastCalledWith(
      `/speech/groups/${groupId}`,
      { base_revision: 1 },
      { headers }
    );
    await endpoints.groups();
    expect(http.get).toHaveBeenLastCalledWith("/speech/groups", {
      headers: { ...headers, "X-TSZ-Dubbing-Groups": "v2" }
    });
    http.get.mockResolvedValueOnce({ groups: [], revision: 0 });
    await expect(endpoints.groupsV3()).rejects.toThrow(
      "配对推荐响应不符合接口契约"
    );
  });
});
