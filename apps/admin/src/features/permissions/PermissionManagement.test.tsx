import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { HttpError } from "@tsz/api-client";
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
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <PermissionManagement />
        </App>
      </ConfigProvider>
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
  it("权限列只显示名称，不展示技术标识，勾选仍使用原权限键", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    for (const permission of catalog.permissions) {
      expect(screen.queryByText(permission.key)).toBeNull();
      const row = document.querySelector(
        `tr[data-row-key="${permission.key}"]`
      )!;
      expect(row.querySelectorAll("td")[1]).toHaveTextContent(permission.label);
    }
    chooseRow("编辑本人词条");
    expect(screen.getByText("已选 1 项")).toBeInTheDocument();
  });
  it("未勾选时隐藏设置标签，勾选后可弹窗操作，取消不发请求", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    expect(screen.queryByText("设置标签")).toBeNull();
    expect(screen.queryByText("新建标签")).toBeNull();
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("设置标签"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("已选 1 项权限")).toBeInTheDocument();
    expect(
      within(dialog).getByText("添加标签").closest("button")
    ).toBeDisabled();
    expect(
      within(dialog).getByText("移除标签").closest("button")
    ).toBeDisabled();
    await selectTag("批量标签", "内容编辑");
    fireEvent.click(within(dialog).getByRole("button", { name: /取\s*消/ }));
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("设置标签支持移除，传入标签版本并保留管理员授权", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("设置标签"));
    await selectTag("批量标签", "内容编辑");
    fireEvent.click(screen.getByText("移除标签"));
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [
          { tag_id: "t1", expected_version: 3, add: [], remove: ["words.edit"] }
        ]
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText("批量标签")).not.toBeVisible()
    );
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("管理标签抽屉提供新建、重命名和删除，独立于权限选择", async () => {
    const create = vi
      .spyOn(api.permissionSystem, "createTag")
      .mockResolvedValue({
        id: "t3",
        name: "审核",
        version: 1,
        permissions: []
      });
    const rename = vi
      .spyOn(api.permissionSystem, "renameTag")
      .mockResolvedValue(undefined);
    const remove = vi
      .spyOn(api.permissionSystem, "deleteTag")
      .mockResolvedValue(undefined);
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByText("管理标签"));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByText("新建标签"));
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "审核" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("审核"));
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).not.toBeVisible()
    );
    const row = within(drawer).getByText("内容编辑").closest("tr")!;
    fireEvent.click(within(row).getByText("重命名"));
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "词条维护" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith("t1", "词条维护", 3)
    );
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).not.toBeVisible()
    );
    fireEvent.click(within(row).getByText("删除"));
    const confirm = (
      await screen.findByText("删除标签？管理员已分配的权限不受影响。")
    ).closest(".ant-popconfirm")!;
    fireEvent.click(
      within(confirm as HTMLElement).getByRole("button", { name: /删\s*除/ })
    );
    await waitFor(() => expect(remove).toHaveBeenCalledWith("t1", 3));
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("标签重名时保留新建表单和输入，允许修改后重试", async () => {
    const create = vi
      .spyOn(api.permissionSystem, "createTag")
      .mockRejectedValueOnce(new HttpError(409, "conflict"))
      .mockResolvedValue({
        id: "t3",
        name: "新的标签",
        version: 0,
        permissions: []
      });
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByText("管理标签"));
    fireEvent.click(screen.getByText("新建标签"));
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "内容编辑" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await screen.findByText("标签名称已存在，请使用其他名称");
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).toBeVisible()
    );
    expect(screen.getByLabelText("标签名称")).toHaveValue("内容编辑");
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "新的标签" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() => expect(create).toHaveBeenLastCalledWith("新的标签"));
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).not.toBeVisible()
    );
  });
  it("重命名的名称冲突保留表单，但版本冲突仍要求重新查看", async () => {
    vi.spyOn(api.permissionSystem, "renameTag").mockRejectedValue(
      new HttpError(409, "conflict")
    );
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByText("管理标签"));
    const drawer = document.querySelector(".ant-drawer")!;
    fireEvent.click(
      within(
        within(drawer as HTMLElement)
          .getByText("内容编辑")
          .closest("tr")!
      ).getByText("重命名")
    );
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "高频操作" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await screen.findByText("标签名称已存在，请使用其他名称");
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).toBeVisible()
    );
    vi.mocked(api.permissionSystem.catalog).mockResolvedValue({
      ...catalog,
      tags: catalog.tags.map((tag) =>
        tag.id === "t1" ? { ...tag, version: tag.version + 1 } : tag
      )
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await screen.findByText("标签已被更新，请重新查看后再保存");
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).not.toBeVisible()
    );
  });
  it("标签被他人删除时刷新目录并清除失效选择，可选择剩余标签重试", async () => {
    vi.mocked(api.permissionSystem.catalog)
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue({ ...catalog, tags: [catalog.tags[1]!] });
    vi.mocked(api.permissionSystem.changeTags).mockRejectedValueOnce(
      new HttpError(404, "tag not found")
    );
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("设置标签"));
    await selectTag("批量标签", "内容编辑");
    fireEvent.click(screen.getByText("添加标签"));
    await screen.findByText("标签已被删除，请重新选择");
    expect(screen.getByText("添加标签").closest("button")).toBeDisabled();
    expect(screen.getByText("移除标签").closest("button")).toBeDisabled();
    expect(api.permissionSystem.catalog).toHaveBeenCalledTimes(2);
    await selectTag("批量标签", "高频操作");
    fireEvent.click(screen.getByText("添加标签"));
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenLastCalledWith({
        catalog_version: "v1",
        targets: [
          { tag_id: "t2", expected_version: 5, add: ["words.edit"], remove: [] }
        ]
      })
    );
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("筛选和重置不清除已选权限，空结果也可恢复目录", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    const row = chooseRow("编辑本人词条");
    expect(row.querySelector('input[type="checkbox"]')).toBeChecked();
    await selectTag("权限标签", "内容编辑");
    await selectTag("所属模块", "用户管理");
    fireEvent.change(screen.getByPlaceholderText("权限名称 / 说明"), {
      target: { value: "不存在的权限" }
    });
    expect(document.querySelector('tr[data-row-key="words.edit"]')).toBeNull();
    expect(screen.getByText("已选 1 项")).toBeInTheDocument();
    fireEvent.click(screen.getByText("重置"));
    expect(screen.getByPlaceholderText("权限名称 / 说明")).toHaveValue("");
    expect(screen.getByLabelText("所属模块")).toHaveValue("");
    expect(screen.getByLabelText("权限标签")).toHaveValue("");
    expect(
      document.querySelector('tr[data-row-key="users.access"]')
    ).toBeInTheDocument();
    expect(
      document.querySelector('tr[data-row-key="words.access"]')
    ).toBeInTheDocument();
    expect(
      screen
        .getByText("编辑本人词条")
        .closest("tr")!
        .querySelector('input[type="checkbox"]')
    ).toBeChecked();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("批量选择的底部操作常驻，状态显示中文，跨页保留选中管理员", async () => {
    const admin = {
      id: "a",
      role: "admin" as const,
      status: "active" as const,
      phone: "19900000001",
      display_name: "管理员甲",
      can_publish_lexicon: false,
      created_at: "2026-10-01",
      updated_at: "2026-10-01"
    };
    vi.mocked(api.admins.list).mockImplementation(async (query) => ({
      items:
        query?.page === 2
          ? [
              {
                ...admin,
                id: "b",
                display_name: "管理员乙",
                status: "disabled" as const
              }
            ]
          : [admin],
      pagination: {
        page: query?.page ?? 1,
        page_size: 20,
        total: 30,
        total_pages: 2
      }
    }));
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("批量授权"));
    await screen.findByText("管理员甲");
    const drawer = document.querySelector(".ant-drawer")!;
    const footer = drawer.querySelector(".ant-drawer-footer")!;
    expect(
      within(footer as HTMLElement).getByText(
        "已选 0 人（单次最多选择 100 人）"
      )
    ).toBeInTheDocument();
    expect(
      within(footer as HTMLElement)
        .getByText("下一步：确认权限变更")
        .closest("button")
    ).toBeDisabled();
    expect(screen.getByText("已启用")).toHaveClass("ant-tag-green");
    expect(screen.getByText("199****0001")).toBeInTheDocument();
    expect(screen.queryByText("19900000001")).toBeNull();
    expect(screen.queryByText("active")).toBeNull();
    chooseRow("管理员甲");
    const scroller = drawer.querySelector<HTMLDivElement>(
      '.ant-drawer-body div[style*="overflow: auto"]'
    )!;
    expect(
      drawer.querySelector(".ant-drawer-body .ant-typography")
    ).toHaveStyle({ maxHeight: "20%", overflowY: "auto" });
    scroller.scrollTop = 100;
    fireEvent.click(drawer.querySelector(".ant-pagination-item-2")!);
    await screen.findByText("管理员乙");
    expect(scroller.scrollTop).toBe(0);
    expect(screen.getByText("已禁用")).toHaveClass("ant-tag-default");
    expect(screen.queryByText("disabled")).toBeNull();
    chooseRow("管理员乙");
    expect(
      screen.getByText("已选 2 人（单次最多选择 100 人）")
    ).toBeInTheDocument();
    scroller.scrollTop = 200;
    fireEvent.click(drawer.querySelector(".ant-pagination-item-1")!);
    const first = await screen.findByText("管理员甲");
    expect(scroller.scrollTop).toBe(0);
    expect(
      first.closest("tr")!.querySelector('input[type="checkbox"]')
    ).toBeChecked();
    fireEvent.click(screen.getByText("下一步：确认权限变更"));
    await waitFor(() =>
      expect(api.permissionSystem.preview).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [
          { admin_id: "a", expected_version: undefined },
          { admin_id: "b", expected_version: undefined }
        ],
        grant: ["words.edit"],
        revoke: []
      })
    );
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it.each([
    ["12345", "****"],
    ["1234567", "****"],
    ["12345678", "123****5678"]
  ])("手机号 %s 脱敏时至少隐藏一个字符", async (phone, masked) => {
    vi.mocked(api.admins.list).mockResolvedValue({
      items: [
        {
          id: "a",
          role: "admin",
          status: "active",
          phone,
          display_name: "边界测试账号",
          can_publish_lexicon: false,
          created_at: "2026-10-01",
          updated_at: "2026-10-01"
        }
      ],
      pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
    });
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("批量授权"));
    await screen.findByText("边界测试账号");
    expect(screen.getByText(masked)).toBeInTheDocument();
    expect(screen.queryByText(phone)).toBeNull();
  });
  it("撤销授权沿用预览流程，不直接提交", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("撤销授权"));
    await screen.findByText("普通小王");
    chooseRow("普通小王");
    fireEvent.click(screen.getByText("下一步：确认权限变更"));
    await waitFor(() =>
      expect(api.permissionSystem.preview).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [{ admin_id: "a", expected_version: undefined }],
        grant: [],
        revoke: ["words.edit"]
      })
    );
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("单独展示权限范围说明，并支持按说明搜索", async () => {
    mount();
    const permission = await screen.findByText("编辑本人词条");
    expect(
      screen.getByText("范围 / 说明", { selector: "th" })
    ).toBeInTheDocument();
    expect(
      within(permission.closest("tr")!).getByText("编辑词条")
    ).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("权限名称 / 说明"), {
      target: { value: "词条目录" }
    });
    expect(
      document.querySelector('tr[data-row-key="words.access"]')
    ).toBeInTheDocument();
    expect(document.querySelector('tr[data-row-key="words.edit"]')).toBeNull();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("搜索与多对多权限标签；标签分类不调用grant/commit", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    expect(screen.getAllByText("高频操作")).toHaveLength(2);
    await selectTag("权限标签", "内容编辑");
    expect(screen.getByText("编辑本人词条")).toBeInTheDocument();
    expect(
      document.querySelector('tr[data-row-key="words.access"]')
    ).toBeNull();
    expect(screen.queryByText("查看用户")).toBeNull();
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("选多个权限、多个标签批量打标，传每个标签版本且不修改授权", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    chooseRow("查看用户");
    fireEvent.click(screen.getByText("设置标签"));
    await selectTag("批量标签", "内容编辑");
    await selectTag("批量标签", "高频操作");
    fireEvent.click(screen.getByText("添加标签"));
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
  it("具体权限分页查看管理员，不显示额外的超管提示", async () => {
    mount();
    const row = await screen.findByText("编辑本人词条");
    fireEvent.click(within(row.closest("tr")!).getByText("查看管理员"));
    const adminName = await screen.findByText("已授权小王");
    expect(screen.getByText("管理员名单")).toBeInTheDocument();
    expect(screen.queryByText("管理员名单 · words.edit")).toBeNull();
    expect(
      within(adminName.closest("tr")!).getByRole("button", { name: "复制" })
    ).toBeInTheDocument();
    expect(within(adminName.closest("tr")!).getByText("a")).toBeInTheDocument();
    expect(api.permissionSystem.grantedAdmins).toHaveBeenCalledWith(
      "words.edit",
      1
    );
    expect(
      screen.queryByText("超级管理员无需单独分配权限，因此不在名单中。")
    ).toBeNull();
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
  it("从目录批量授权先选普通管理员，再共用preview而不直接提交", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("批量授权"));
    await screen.findByText("普通小王");
    expect(api.admins.list).toHaveBeenCalledWith({
      role: "admin",
      display_name: undefined,
      page: 1,
      page_size: 20
    });
    chooseRow("普通小王");
    fireEvent.click(screen.getByText("下一步：确认权限变更"));
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
