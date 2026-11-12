import { describe, expect, it, vi } from "vitest";
import { decodeDubbingGroupsV3 } from "./dubbing-groups-v3";
import { createAdminEndpoints } from "./admin";
import type { HttpClient } from "./http";
import type { VoiceProfileV3 } from "@tsz/types";
import spec from "./openapi.snapshot.json";

describe("音色库契约", () => {
  it("局部池显式版本与推荐来源严格解析，resolve携带v6且原样传输无推荐池", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const profile: VoiceProfileV3 = {
      voices: [
        {
          voice_id: "sonia",
          enabled: false,
          rate_percent: -27,
          version_id: id,
          version_name: "保留参数",
          locale: "en-GB"
        }
      ],
      dubbing: {
        area: "word" as const,
        uk: { mode: "local" as const },
        us: { mode: "local" as const }
      }
    };
    expect(spec.schemas.VoiceSideDubbingV3.required).toContain("mode");
    expect(spec.schemas.LocalVoiceRecommendationV3.additionalProperties).toBe(
      false
    );
    expect(spec.schemas.LocalVoiceRecommendationV3.required).toEqual([
      "group_id",
      "recommendation_id",
      "voice_id"
    ]);
    const http = {
      post: vi.fn().mockResolvedValue({ voices: [], source: { kind: "local" } })
    };
    const input = {
      profile,
      accent: "gb" as const,
      source: {
        kind: "text" as const,
        content: { version: 2 as const, text: "hello", annotations: [] }
      }
    };
    await createAdminEndpoints(http as unknown as HttpClient).speech.resolve(
      input
    );
    expect(http.post).toHaveBeenCalledWith("/speech/resolve", input, {
      signal: undefined,
      headers: { "X-TSZ-Voice-Versions": "v6" }
    });
    expect(http.post.mock.calls[0]![1].profile).toBe(profile);
  });
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
      "us",
      "revision",
      "is_global"
    ]);
    expect(
      spec.operationSchemas["put /admin/speech/groups"].responses
    ).toHaveProperty("409");
  });
});

const groupId = "018f47b8-e3c1-7bd1-9f0a-123456789aa1";
const ukId = "018f47b8-e3c1-7bd1-9f0a-123456789aa3";
const usId = "018f47b8-e3c1-7bd1-9f0a-123456789aa4";
function independentGroups() {
  const item = (id: string, name: string, alias: string, selected = true) => ({
    id,
    name,
    voice_alias: alias,
    selected,
    parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
  });
  return {
    revision: 2,
    order_revision: 1,
    groups: [
      {
        id: groupId,
        name: "独立推荐",
        areas: ["word"],
        revision: 1,
        is_global: false,
        uk: [
          item(ukId, "英式一", "en-gb-sonianeural", false),
          item(usId, "英式二", "en-gb-sonianeural")
        ],
        us: []
      }
    ]
  };
}

describe("英美独立推荐契约", () => {
  it("所有分组读写声明同一严格独立表示与顺序版本", () => {
    for (const operation of [
      "get /admin/speech/groups",
      "post /admin/speech/groups",
      "put /admin/speech/groups/{id}",
      "delete /admin/speech/groups/{id}"
    ] as const) {
      expect(spec.operationSchemas[operation].responses["200"]).toEqual({
        $ref: "#/components/schemas/DubbingGroupsResponse"
      });
    }
    expect(spec.schemas.DubbingGroupsResponse.required).toContain(
      "order_revision"
    );
    expect(spec.schemas.DubbingGroup.additionalProperties).toBe(false);
  });
  it("保留不等长、空侧、同声多参数与独立选择状态", () => {
    const value = independentGroups();
    expect(decodeDubbingGroupsV3(value)).toBe(value);
    expect(value.groups[0]!.uk.map((item) => item.selected)).toEqual([
      false,
      true
    ]);
  });
  it("拒绝缺失侧、旧配对表示和未知字段", () => {
    const good = independentGroups();
    const { us: _us, ...missingSide } = good.groups[0]!;
    for (const value of [
      { groups: [], revision: 0 },
      { ...good, groups: [missingSide] },
      {
        ...good,
        groups: [
          {
            ...good.groups[0],
            recommendations: { format: "paired", pairs: [] }
          }
        ]
      },
      {
        ...good,
        groups: [
          { ...good.groups[0], uk: [{ ...good.groups[0]!.uk[0], extra: true }] }
        ]
      }
    ])
      expect(() => decodeDubbingGroupsV3(value)).toThrow(
        "分组推荐响应不符合接口契约"
      );
  });
  it("单组保存、顺序和删除分别发送精确命令，并严格解析返回", async () => {
    const value = independentGroups();
    const http = {
      get: vi.fn().mockResolvedValue(value),
      post: vi.fn().mockResolvedValue(value),
      put: vi.fn().mockResolvedValue(value),
      del: vi.fn().mockResolvedValue(value)
    };
    const endpoints = createAdminEndpoints(
      http as unknown as HttpClient
    ).speech;
    const headers = { "X-TSZ-Dubbing-Groups": "v4" };
    await expect(endpoints.groupsV3()).resolves.toBe(value);
    expect(http.get).toHaveBeenLastCalledWith("/speech/groups", { headers });
    const input = { group: value.groups[0]!, base_revision: 1 };
    await endpoints.saveIndependentGroup(input, true);
    expect(http.post).toHaveBeenLastCalledWith("/speech/groups", input, {
      headers
    });
    await endpoints.saveIndependentGroup(input);
    expect(http.put).toHaveBeenLastCalledWith(
      `/speech/groups/${groupId}`,
      input,
      { headers }
    );
    const order = { group_ids: [groupId], base_revision: 1 };
    await endpoints.saveGroupOrder(order);
    expect(http.put).toHaveBeenLastCalledWith("/speech/groups/order", order, {
      headers
    });
    await endpoints.deleteGroupV3(groupId, 1);
    expect(http.del).toHaveBeenLastCalledWith(
      `/speech/groups/${groupId}`,
      { base_revision: 1 },
      { headers }
    );
    http.get.mockResolvedValueOnce({ groups: [], revision: 0 });
    await expect(endpoints.groupsV3()).rejects.toThrow(
      "分组推荐响应不符合接口契约"
    );
  });
});
