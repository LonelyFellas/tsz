import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import type { PermissionTag } from "@tsz/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { AdminPermissionEditor } from "./AdminPermissionEditor";

const tags: PermissionTag[] = [
  {
    id: "tag-edit",
    name: "词条编辑",
    version: 0,
    permissions: ["words.access", "words.edit"]
  },
  {
    id: "tag-sentence",
    name: "例句查看",
    version: 0,
    permissions: ["words.access", "sentences.access"]
  },
  { id: "tag-empty", name: "空标签", version: 0, permissions: [] }
];

function mount(
  permissions = ["words.access", "words.edit"],
  permissionTags: PermissionTag[] = []
) {
  vi.spyOn(api.permissionSystem, "catalog").mockResolvedValue({
    catalog_version: "v1",
    tags: permissionTags,
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
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <AdminPermissionEditor
            adminId="a"
            displayName="管理员甲"
            onClose={vi.fn()}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
afterEach(() => vi.restoreAllMocks());

describe("个人权限设置", () => {
  it("模块默认收起，显示已选数量，展开和收起不丢选择", async () => {
    mount();
    await screen.findByText("智能词库");
    expect(screen.getByText("多维例句")).toBeInTheDocument();
    expect(screen.getByText("已选 2 / 2 项")).toBeInTheDocument();
    expect(screen.getByText("已选 0 / 1 项")).toBeInTheDocument();
    expect(screen.getByText("编辑自己的词条及修订")).not.toBeVisible();
    fireEvent.click(screen.getByText("智能词库"));
    await waitFor(() =>
      expect(screen.getByText("编辑自己的词条及修订")).toBeVisible()
    );
    fireEvent.click(screen.getByText("智能词库"));
    await waitFor(() =>
      expect(screen.getByText("编辑自己的词条及修订")).not.toBeVisible()
    );
    expect(screen.getByLabelText(/编辑词条/)).toBeChecked();
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
  it("修改展开模块时保留从未展开模块的已有权限", async () => {
    mount(["words.access", "words.edit", "sentences.access"]);
    fireEvent.click(await screen.findByText("智能词库"));
    expect(screen.getByText("例句查看")).not.toBeVisible();
    fireEvent.click(screen.getByLabelText(/编辑词条/));
    expect(screen.getByLabelText(/例句查看/)).toBeChecked();
    expect(screen.getByText("已选 2 项权限")).toBeInTheDocument();
    expect(screen.getByText("已选 1 / 1 项")).toBeInTheDocument();
    fireEvent.click(screen.getByText("下一步：确认权限变更"));
    await waitFor(() =>
      expect(api.permissionSystem.preview).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [{ admin_id: "a", expected_version: 3 }],
        grant: [],
        revoke: ["words.edit"]
      })
    );
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("按标签追加并去重，不清空已有选择，仍可逐项调整后统一预览", async () => {
    mount(["words.access"], tags);
    await screen.findByText("智能词库");
    vi.spyOn(api.permissionSystem, "changeTags");
    async function addTag(name: string) {
      fireEvent.mouseDown(screen.getByLabelText("按标签添加"));
      const option = `.ant-select-item-option[title="${name}（2 项）"]`;
      await waitFor(() =>
        expect(document.querySelector(option)).not.toBeNull()
      );
      fireEvent.click(document.querySelector(option)!);
    }
    await addTag("词条编辑");
    expect(screen.getByText("选择标签，将权限加入勾选")).toBeVisible();
    expect(screen.getByText("已选 2 项权限")).toBeInTheDocument();
    await addTag("例句查看");
    expect(screen.getByText("已选 3 项权限")).toBeInTheDocument();
    await addTag("词条编辑");
    expect(screen.getByText("已选 3 项权限")).toBeInTheDocument();
    expect(screen.getByText("已选 2 / 2 项")).toBeInTheDocument();
    expect(screen.getByText("已选 1 / 1 项")).toBeInTheDocument();
    expect(screen.getByLabelText(/^查看词条$/)).toBeChecked();
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("多维例句"));
    fireEvent.click(
      screen.getByText("例句查看").closest("label")!.querySelector("input")!
    );
    expect(screen.getByText("已选 2 项权限")).toBeInTheDocument();
    fireEvent.click(screen.getByText("下一步：确认权限变更"));
    await waitFor(() =>
      expect(api.permissionSystem.preview).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [{ admin_id: "a", expected_version: 3 }],
        grant: ["words.edit"],
        revoke: []
      })
    );
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("没有可用标签时禁用快捷添加，空标签不可选择", async () => {
    mount([], [tags[2]!]);
    await screen.findByText("智能词库");
    expect(screen.getByLabelText("按标签添加")).toBeDisabled();
    expect(screen.getByText("暂无可用标签")).toBeInTheDocument();
    expect(screen.getByText("已选 0 项权限")).toBeInTheDocument();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("个人设置与批量共用预览和精确版本，确认页显示选定名字和中文权限", async () => {
    mount();
    fireEvent.click(await screen.findByText("智能词库"));
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
