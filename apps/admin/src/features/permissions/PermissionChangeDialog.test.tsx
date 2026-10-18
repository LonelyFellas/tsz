import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { HttpError } from "@tsz/api-client";
import type { PermissionPreviewResponse } from "@tsz/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";

const preview: PermissionPreviewResponse = {
  catalog_version: "v1",
  targets: [
    {
      admin_id: "a",
      expected_version: 3,
      before: [],
      after: ["words.access", "words.edit", "words.edit_others"],
      grant: ["words.access", "words.edit", "words.edit_others"],
      revoke: [],
      dependency_grants: ["words.access", "words.edit"],
      dependency_revocations: []
    }
  ]
};
const current: PermissionPreviewResponse = {
  catalog_version: "v2",
  targets: [
    {
      ...preview.targets[0]!,
      expected_version: 4,
      before: ["words.access"],
      after: ["words.access"],
      grant: [],
      revoke: [],
      dependency_grants: [],
      dependency_revocations: []
    }
  ]
};
afterEach(() => vi.restoreAllMocks());
function mount(extra: { expectedVersions?: Record<string, number> } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const committed = vi.fn();
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <App>
        <PermissionChangeDialog
          catalogVersion="v1"
          adminIds={["a"]}
          grant={["words.edit_others"]}
          revoke={[]}
          onCommitted={committed}
          onClose={close}
          {...extra}
        />
      </App>
    </QueryClientProvider>
  );
  return { client, committed, close };
}
function allowReread() {
  vi.spyOn(api.permissionSystem, "catalog").mockResolvedValue({
    catalog_version: "v2",
    permissions: [],
    tags: []
  });
}

describe("单人/批量权限精确预览提交", () => {
  it("只列实际开通和取消的权限，依赖调整在对应列标注", async () => {
    vi.spyOn(api.permissionSystem, "preview").mockResolvedValue(preview);
    mount();
    await screen.findByText("words.edit_others");
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent)
    ).toEqual(["管理员", "开通", "取消"]);
    expect(
      screen
        .getByText("words.access、words.edit")
        .closest(".ant-typography-warning")
    ).toHaveTextContent("自动补齐：words.access、words.edit");
    expect(screen.queryByText("同时开通")).toBeNull();
  });

  it("显式展示依赖，点击确认前不保存；commit逐人使用服务端展开的差异与版本", async () => {
    const read = vi
      .spyOn(api.permissionSystem, "preview")
      .mockResolvedValue(preview);
    const save = vi.spyOn(api.permissionSystem, "commit").mockResolvedValue({
      request_id: "r",
      targets: []
    });
    const { committed } = mount({ expectedVersions: { a: 3 } });
    await screen.findByText("words.access、words.edit");
    expect(read).toHaveBeenCalledWith({
      catalog_version: "v1",
      targets: [{ admin_id: "a", expected_version: 3 }],
      grant: ["words.edit_others"],
      revoke: []
    });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("保存变更"));
    await waitFor(() => expect(committed).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith({
      catalog_version: "v1",
      targets: [
        {
          admin_id: "a",
          expected_version: 3,
          grant: ["words.access", "words.edit", "words.edit_others"],
          revoke: []
        }
      ]
    });
  });

  it("修改他人权限仅回读业务查询，不用targets覆盖当前超管profile或role", async () => {
    const own = {
      id: "self-super",
      role: "super_admin" as const,
      phone: "13800138000",
      display_name: "主超管",
      preferences: { dialect: "uk" as const },
      permission_version: 8,
      catalog_version: "v1",
      permissions: ["words.access"]
    };
    useAuthStore.getState().setProfile(own);
    vi.spyOn(api.permissionSystem, "preview").mockResolvedValue(preview);
    vi.spyOn(api.permissionSystem, "commit").mockResolvedValue({
      request_id: "r",
      targets: [
        {
          admin_id: "a",
          permission_version: 4,
          catalog_version: "v1",
          permissions: ["words.access", "words.edit", "words.edit_others"]
        }
      ]
    });
    const { committed } = mount();
    await screen.findByText("words.access、words.edit");
    fireEvent.click(screen.getByText("保存变更"));
    await waitFor(() => expect(committed).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().profile).toBe(own);
    expect(useAuthStore.getState().role).toBe("super_admin");
  });

  it("撤销依赖提交前明示；409废弃旧预览，批量回读后重新确认，不盲重试", async () => {
    allowReread();
    const read = vi
      .spyOn(api.permissionSystem, "preview")
      .mockResolvedValueOnce({
        catalog_version: "v1",
        targets: [
          {
            ...preview.targets[0]!,
            grant: [],
            revoke: ["words.edit", "words.edit_others"],
            dependency_grants: [],
            dependency_revocations: ["words.edit_others"]
          }
        ]
      })
      .mockResolvedValue(current);
    const save = vi
      .spyOn(api.permissionSystem, "commit")
      .mockRejectedValue(
        new HttpError(409, "revision conflict", [], "revision_conflict")
      );
    const { client, committed } = mount();
    const reload = vi.spyOn(client, "invalidateQueries");
    const automaticRevoke = await screen.findByText("words.edit_others", {
      selector: ".ant-typography-danger span"
    });
    expect(automaticRevoke.closest(".ant-typography-danger")).toHaveTextContent(
      "自动取消：words.edit_others"
    );
    fireEvent.click(screen.getByText("保存变更"));
    await screen.findByText(
      "已重新读取当前权限。请核对后返回，重新选择需要的调整。"
    );
    expect(read).toHaveBeenLastCalledWith({
      catalog_version: "v2",
      targets: [{ admin_id: "a" }],
      grant: [],
      revoke: []
    });
    expect(screen.getByText("当前权限")).toBeInTheDocument();
    expect(screen.queryByText("保存变更")).toBeNull();
    expect(save).toHaveBeenCalledOnce();
    expect(committed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("返回查看"));
    expect(reload).toHaveBeenCalledWith({ queryKey: ["permission-system"] });
  });

  it.each([
    new TypeError("network timeout"),
    new HttpError(503, "upstream failed"),
    new Error("保存响应不完整")
  ])(
    "提交结果未知先回读，不说一定没保存，不复用旧版本重试：%s",
    async (failure) => {
      allowReread();
      const read = vi
        .spyOn(api.permissionSystem, "preview")
        .mockResolvedValueOnce(preview)
        .mockResolvedValue(current);
      const save = vi
        .spyOn(api.permissionSystem, "commit")
        .mockRejectedValue(failure);
      const { committed } = mount({ expectedVersions: { a: 3 } });
      await screen.findByText("words.access、words.edit");
      fireEvent.click(screen.getByText("保存变更"));
      await screen.findByText("当前权限");
      expect(read).toHaveBeenLastCalledWith({
        catalog_version: "v2",
        targets: [{ admin_id: "a" }],
        grant: [],
        revoke: []
      });
      expect(screen.queryByText("保存变更")).toBeNull();
      expect(screen.queryByText("权限已保存")).toBeNull();
      expect(save).toHaveBeenCalledOnce();
      expect(committed).not.toHaveBeenCalled();
    }
  );

  it("提交后回读也失败时保持提交禁用，仅允许重新查看，不能声称未保存", async () => {
    vi.spyOn(api.permissionSystem, "preview").mockResolvedValue(preview);
    vi.spyOn(api.permissionSystem, "catalog").mockRejectedValue(
      new TypeError("offline")
    );
    const save = vi
      .spyOn(api.permissionSystem, "commit")
      .mockRejectedValue(new TypeError("response lost"));
    mount();
    await screen.findByText("words.access、words.edit");
    fireEvent.click(screen.getByText("保存变更"));
    await screen.findByText("暂时无法确认是否保存成功，请重新查看后再操作");
    expect(screen.queryByText("保存变更")).toBeNull();
    expect(screen.queryByText("当前权限")).toBeNull();
    fireEvent.click(screen.getByText("重新查看"));
    await waitFor(() =>
      expect(api.permissionSystem.catalog).toHaveBeenCalledTimes(2)
    );
    expect(save).toHaveBeenCalledOnce();
  });

  it("预览失败不提供保存，错误可重新查看", async () => {
    vi.spyOn(api.permissionSystem, "preview").mockRejectedValue(
      new HttpError(503, "目录暂不可用")
    );
    const save = vi
      .spyOn(api.permissionSystem, "commit")
      .mockResolvedValue({ request_id: "r", targets: [] });
    mount();
    await screen.findByText("目录暂不可用");
    expect(screen.getByText("保存变更").closest("button")).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
});
