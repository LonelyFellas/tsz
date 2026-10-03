import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { AdminPermissionEditor } from "./AdminPermissionEditor";

function mount(permissions = ["words.access", "words.edit"]) {
  vi.spyOn(api.permissionSystem, "catalog").mockResolvedValue({
    catalog_version: "v1",
    tags: [],
    permissions: [
      {
        key: "words.access",
        label: "查看词条",
        description: "查看词条",
        module_key: "words",
        kind: "page",
        risk_level: "low",
        requires: []
      },
      {
        key: "words.edit",
        label: "编辑词条",
        description: "编辑自己的词条及修订",
        module_key: "words",
        kind: "action",
        risk_level: "medium",
        requires: ["words.access"]
      },
      {
        key: "sentences.access",
        label: "例句查看",
        description: "查看后台共享例句",
        module_key: "sentences",
        kind: "page",
        risk_level: "low",
        requires: []
      }
    ]
  });
  vi.spyOn(api.permissionSystem, "forAdmin").mockResolvedValue({
    admin_id: "a",
    permission_version: 3,
    catalog_version: "v1",
    permissions
  });
  vi.spyOn(api.permissionSystem, "preview").mockResolvedValue({
    catalog_version: "v1",
    targets: [
      {
        admin_id: "a",
        expected_version: 3,
        before: permissions,
        after: ["words.access"],
        grant: [],
        revoke: ["words.edit"],
        dependency_grants: [],
        dependency_revocations: []
      }
    ]
  });
  vi.spyOn(api.permissionSystem, "commit").mockResolvedValue({
    request_id: "r",
    targets: []
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>
        <AdminPermissionEditor
          adminId="a"
          displayName="管理员甲"
          onClose={vi.fn()}
        />
      </App>
    </QueryClientProvider>
  );
}
afterEach(() => vi.restoreAllMocks());

describe("个人权限设置", () => {
  it("按业务模块分组，隐藏技术标识并显示选择数量", async () => {
    mount();
    await screen.findByText("智能词库");
    expect(screen.getByText("多维例句")).toBeInTheDocument();
    expect(screen.getByText("已选 2 项权限")).toBeInTheDocument();
    expect(screen.queryByText("words.access")).toBeNull();
    expect(screen.queryByText("words.edit")).toBeNull();
    expect(screen.queryByText("sentences.access")).toBeNull();
    expect(screen.getByText("前置权限：查看词条")).toBeInTheDocument();
    expect(
      screen.getByText("下一步：确认权限变更").closest("button")
    ).toBeDisabled();
  });
  it("回填已有权限，不把现有账号称为未分配；无依赖的项不显示多余说明", async () => {
    mount();
    const access = (await screen.findByText("查看词条"))
      .closest("label")!
      .querySelector("input")!;
    expect(access).toBeChecked();
    expect(screen.getByLabelText(/编辑词条/)).toBeChecked();
    expect(screen.getByText("编辑自己的词条及修订")).toBeInTheDocument();
    expect(screen.queryByText("当前尚未分配权限")).toBeNull();
    expect(access.closest("label")).not.toHaveTextContent("前置权限");
    expect(
      screen.getByText("勾选权限后，确认变更再保存。")
    ).toBeInTheDocument();
  });
  it("零权限显示当前状态，而不推断新账号；未选择调整不保存", async () => {
    mount([]);
    await screen.findByText("当前尚未分配权限");
    expect(
      screen.getByText("查看词条").closest("label")!.querySelector("input")
    ).not.toBeChecked();
    expect(
      screen.getByText("下一步：确认权限变更").closest("button")
    ).toBeDisabled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("个人设置与批量共用预览和精确版本，确认页显示选定名字和中文权限", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText(/编辑词条/));
    fireEvent.click(screen.getByText("下一步：确认权限变更"));
    await waitFor(() =>
      expect(api.permissionSystem.preview).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [{ admin_id: "a", expected_version: 3 }],
        grant: [],
        revoke: ["words.edit"]
      })
    );
    expect(
      await screen.findByText("管理员甲", { selector: '[title="a"]' })
    ).toBeInTheDocument();
    expect(
      screen.getByText("编辑词条", { selector: '[title="words.edit"]' })
    ).toBeInTheDocument();
    expect(api.permissionSystem.forAdmin).toHaveBeenCalledOnce();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
});
