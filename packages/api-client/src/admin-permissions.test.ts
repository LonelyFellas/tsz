import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminEndpoints } from "./admin";
import { createHttpClient } from "./http";
import {
  decodeAdminProfile,
  InvalidAdminProfileResponseError
} from "./admin-permissions";

const profile = {
  id: "a",
  role: "admin",
  phone: "13800138000",
  display_name: "管理员",
  preferences: { dialect: "uk" },
  permission_version: 1,
  catalog_version: "v1",
  permissions: []
};
afterEach(() => vi.restoreAllMocks());

describe("管理员新版 profile 失败关闭", () => {
  it.each(["permission_version", "catalog_version", "permissions"])(
    "缺 %s 不建立授权身份",
    (key) => {
      const old = { ...profile } as Record<string, unknown>;
      delete old[key];
      old.can_publish_lexicon = true;
      expect(() => decodeAdminProfile(old)).toThrow(
        InvalidAdminProfileResponseError
      );
    }
  );
  it.each([
    null,
    {},
    { ...profile, id: "" },
    { ...profile, role: "future_role" },
    { ...profile, permission_version: -1 },
    { ...profile, permission_version: 1.5 },
    { ...profile, catalog_version: "" },
    { ...profile, permissions: null },
    { ...profile, permissions: "*" },
    { ...profile, permissions: ["words.access", 1] }
  ])("畸形授权响应拒绝", (value) => {
    expect(() => decodeAdminProfile(value)).toThrow(
      InvalidAdminProfileResponseError
    );
  });
  it("非null空数组与未知字符串允许传输，但不赋予未知业务能力", () => {
    expect(decodeAdminProfile(profile)).toEqual(profile);
    expect(
      decodeAdminProfile({ ...profile, permissions: ["future.access"] })
        .permissions
    ).toEqual(["future.access"]);
  });
});

describe("真实请求层权限 API method/path/wire", () => {
  it("单人与批量同用preview/commit，依赖差异与版本逐人传输", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/preview")
              ? {
                  catalog_version: "v1",
                  targets: ["a", "b"].map((admin_id) => ({
                    admin_id,
                    expected_version: 2,
                    before: [],
                    after: [],
                    grant: [],
                    revoke: [],
                    dependency_grants: [],
                    dependency_revocations: []
                  }))
                }
              : {
                  request_id: "r",
                  targets: [
                    {
                      admin_id: "a",
                      permission_version: 3,
                      catalog_version: "v1",
                      permissions: [
                        "words.access",
                        "words.edit",
                        "words.edit_others"
                      ]
                    }
                  ]
                }
          ),
          { status: 200 }
        )
    );
    const api = createAdminEndpoints(
      createHttpClient({ baseUrl: "/api/v1/admin" })
    );
    const input = {
      catalog_version: "v1",
      targets: [{ admin_id: "a", expected_version: 2 }, { admin_id: "b" }],
      grant: ["words.edit_others"],
      revoke: []
    };
    await api.permissionSystem.preview(input);
    const commit = {
      catalog_version: "v1",
      targets: [
        {
          admin_id: "a",
          expected_version: 2,
          grant: ["words.access", "words.edit", "words.edit_others"],
          revoke: []
        }
      ]
    };
    await api.permissionSystem.commit(commit);
    expect(
      fetch.mock.calls.map(([url, init]) => [
        url,
        init?.method,
        JSON.parse(init?.body as string)
      ])
    ).toEqual([
      ["/api/v1/admin/permission-changes/preview", "POST", input],
      ["/api/v1/admin/permission-changes", "POST", commit]
    ]);
  });
  it("preview缺目标或commit确认响应缺字段时不能当成功，交给UI回读", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ catalog_version: "v1", targets: [] }), {
        status: 200
      })
    );
    const api = createAdminEndpoints(
      createHttpClient({ baseUrl: "/api/v1/admin" })
    );
    await expect(
      api.permissionSystem.preview({
        catalog_version: "v1",
        targets: [{ admin_id: "a" }],
        grant: [],
        revoke: []
      })
    ).rejects.toThrow("权限调整结果不完整");
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ request_id: "r", targets: [] }), {
        status: 200
      })
    );
    await expect(
      api.permissionSystem.commit({
        catalog_version: "v1",
        targets: [{ admin_id: "a", expected_version: 1, grant: [], revoke: [] }]
      })
    ).rejects.toThrow("保存响应不完整");
  });

  it("目录、个人配置、授权人员分页、标签CAS与审计保持后端契约", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url, init) =>
        new Response(
          init?.method === "DELETE" || init?.method === "PATCH"
            ? null
            : JSON.stringify([]),
          {
            status:
              init?.method === "DELETE" || init?.method === "PATCH" ? 204 : 200
          }
        )
    );
    const api = createAdminEndpoints(
      createHttpClient({ baseUrl: "/api/v1/admin" })
    ).permissionSystem;
    await api.catalog();
    await api.forAdmin("a");
    await api.grantedAdmins("words.edit", 2, 10);
    expect(await api.tags()).toEqual([]);
    await api.createTag("编辑", "blue");
    await api.updateTag("tag", "新标签", "purple", 3);
    await api.deleteTag("tag", 4);
    const tagChanges = {
      catalog_version: "v1",
      targets: [
        { tag_id: "tag", expected_version: 5, add: ["words.edit"], remove: [] }
      ]
    };
    expect(await api.changeTags(tagChanges)).toEqual([]);
    await api.audits({
      admin_id: "a",
      permission_key: "words.edit",
      page: 2,
      page_size: 10
    });
    expect(
      fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])
    ).toEqual([
      ["/api/v1/admin/permissions", "GET"],
      ["/api/v1/admin/admins/a/permissions", "GET"],
      [
        "/api/v1/admin/permissions/words.edit/admins?page=2&page_size=10",
        "GET"
      ],
      ["/api/v1/admin/permission-tags", "GET"],
      ["/api/v1/admin/permission-tags", "POST"],
      ["/api/v1/admin/permission-tags/tag", "PATCH"],
      ["/api/v1/admin/permission-tags/tag?expected_version=4", "DELETE"],
      ["/api/v1/admin/permission-tag-changes", "POST"],
      [
        "/api/v1/admin/permission-audits?admin_id=a&permission_key=words.edit&page=2&page_size=10",
        "GET"
      ]
    ]);
    expect(JSON.parse(fetch.mock.calls[5]![1]?.body as string)).toEqual({
      name: "新标签",
      color: "purple",
      expected_version: 3
    });
    expect(JSON.parse(fetch.mock.calls[7]![1]?.body as string)).toEqual(
      tagChanges
    );
  });
});
