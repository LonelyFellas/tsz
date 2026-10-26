import { describe, expect, it } from "vitest";
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
    expect(spec.schemas.SaveDubbingUpdateSettings.required).toContain(
      "base_revision"
    );
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
