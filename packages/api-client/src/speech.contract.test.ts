import { describe, expect, it } from "vitest";
import spec from "./openapi.snapshot.json";

describe("音色库契约", () => {
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

  it("分组整体保存英美推荐并携带版本号", () => {
    expect(spec.paths["/admin/speech/groups"]).toEqual(["get", "put"]);
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
