import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App } from "antd";
import type { UnifiedPermissionCatalog } from "@tsz/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { PermissionManagement } from "./PermissionManagement";

const catalog: UnifiedPermissionCatalog = {
  catalog_version: "v1",
  permissions: [
    {
      key: "words.access",
      module_key: "words",
      label: "查看词条",
      description: "词条目录",
      kind: "page",
      requires: [],
      risk_level: "low"
    },
    {
      key: "words.edit",
      module_key: "words",
      label: "编辑本人词条",
      description: "编辑词条",
      kind: "action",
      requires: ["words.access"],
      risk_level: "medium"
    },
    {
      key: "users.access",
      module_key: "users",
      label: "查看用户",
      description: "用户目录",
      kind: "page",
      requires: [],
      risk_level: "medium"
    }
  ],
  tags: [
    { id: "t1", name: "内容编辑", version: 3, permissions: ["words.edit"] },
    {
      id: "t2",
      name: "高频操作",
      version: 5,
      permissions: ["words.edit", "users.access"]
    }
  ]
};
beforeEach(() => {
  vi.spyOn(api.permissionSystem, "catalog").mockResolvedValue(catalog);
  vi.spyOn(api.permissionSystem, "changeTags").mockResolvedValue(catalog.tags);
  vi.spyOn(api.permissionSystem, "commit").mockResolvedValue({
    request_id: "r",
    targets: []
  });
  vi.spyOn(api.permissionSystem, "preview").mockResolvedValue({
    catalog_version: "v1",
    targets: []
  });
  vi.spyOn(api.permissionSystem, "grantedAdmins").mockResolvedValue({
    items: [
      { admin_id: "a", display_name: "已授权小王", permission_version: 2 }
    ],
    total: 22,
    page: 1,
    page_size: 20,
    super_admins_are_implicit: true
  });
  vi.spyOn(api.admins, "list").mockResolvedValue({
    items: [
      {
        id: "a",
        role: "admin",
        status: "active",
        phone: "13800138000",
        display_name: "普通小王",
        can_publish_lexicon: false,
        created_at: "2026-10-01",
        updated_at: "2026-10-01"
      }
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
});
afterEach(() => vi.restoreAllMocks());
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>
        <PermissionManagement />
      </App>
    </QueryClientProvider>
  );
}
function chooseRow(label: string) {
  const row = screen.getByText(label).closest("tr")!;
  fireEvent.click(row.querySelector('input[type="checkbox"]')!);
  return row;
}
async function selectTag(label: string, name: string) {
  fireEvent.mouseDown(screen.getByLabelText(label));
  await waitFor(() =>
    expect(
      document.querySelector(`.ant-select-item-option[title="${name}"]`)
    ).not.toBeNull()
  );
  fireEvent.click(
    document.querySelector(`.ant-select-item-option[title="${name}"]`)!
  );
}

describe("权限目录、标签和授权人员", () => {
  it("搜索与多对多标签筛选；标签分类不调用grant/commit", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    expect(screen.getAllByText("高频操作")).toHaveLength(3);
    await selectTag("标签筛选", "内容编辑");
    expect(screen.getByText("编辑本人词条")).toBeInTheDocument();
    expect(screen.queryByText("words.access")).toBeNull();
    expect(screen.queryByText("查看用户")).toBeNull();
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("选多个权限、多个标签批量打标，传每个标签版本且不修改授权", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    chooseRow("查看用户");
    await selectTag("批量标签", "内容编辑");
    await selectTag("批量标签", "高频操作");
    fireEvent.click(screen.getByText("批量打标签"));
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenCalledOnce()
    );
    expect(api.permissionSystem.changeTags).toHaveBeenCalledWith({
      catalog_version: "v1",
      targets: [
        {
          tag_id: "t1",
          expected_version: 3,
          add: ["words.edit", "users.access"],
          remove: []
        },
        {
          tag_id: "t2",
          expected_version: 5,
          add: ["words.edit", "users.access"],
          remove: []
        }
      ]
    });
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("具体权限分页查看管理员并说明超管隐式全权", async () => {
    mount();
    const row = await screen.findByText("编辑本人词条");
    fireEvent.click(within(row.closest("tr")!).getByText("查看管理员"));
    await screen.findByText("已授权小王");
    expect(api.permissionSystem.grantedAdmins).toHaveBeenCalledWith(
      "words.edit",
      1
    );
    expect(
      screen.getByText("超级管理员无需单独分配权限，因此不在名单中。")
    ).toBeInTheDocument();
    fireEvent.click(
      document.querySelector(".ant-drawer .ant-pagination-item-2")!
    );
    await waitFor(() =>
      expect(api.permissionSystem.grantedAdmins).toHaveBeenCalledWith(
        "words.edit",
        2
      )
    );
  });
  it("从目录批量开通先选普通管理员，再共用preview而不直接提交", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("批量开通"));
    await screen.findByText("普通小王");
    expect(api.admins.list).toHaveBeenCalledWith({
      role: "admin",
      display_name: undefined,
      page: 1,
      page_size: 20
    });
    chooseRow("普通小王");
    fireEvent.click(screen.getByText("查看调整"));
    await waitFor(() =>
      expect(api.permissionSystem.preview).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [{ admin_id: "a", expected_version: undefined }],
        grant: ["words.edit"],
        revoke: []
      })
    );
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
});
