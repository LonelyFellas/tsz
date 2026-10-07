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
    {
      id: "t1",
      name: "内容编辑",
      color: "blue",
      version: 3,
      permissions: ["words.edit"]
    },
    {
      id: "t2",
      name: "高频操作",
      color: "purple",
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
function chooseTagRow(name: string) {
  const drawer = within(document.querySelector(".ant-drawer")!);
  const row = drawer.getByText(name).closest("tr")!;
  fireEvent.click(row.querySelector('input[type="checkbox"]')!);
  return row;
}
function confirmTagChange(action: "添加" | "移除") {
  fireEvent.click(screen.getByRole("button", { name: `确认${action}` }));
}

describe("权限目录、标签和授权人员", () => {
  it("单一标签管理入口在同一抽屉提供批量设置与标签目录", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    const managerButtons = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "标签管理"
    );
    expect(managerButtons).toHaveLength(1);
    fireEvent.click(managerButtons[0]!);
    const drawer = within(document.querySelector(".ant-drawer")!);
    expect(drawer.getByText("标签管理")).toBeInTheDocument();
    expect(
      drawer
        .getByText("内容编辑")
        .closest("tr")!
        .querySelector('input[type="checkbox"]')
    ).toBeChecked();
    expect(drawer.getByText("勾选后确认")).toBeInTheDocument();
    expect(drawer.getByText("新建标签")).toBeVisible();
    expect(drawer.getByText("内容编辑")).toBeVisible();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it("标签列表回显已选权限的归属状态", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByRole("button", { name: "标签管理" }));
    const drawer = within(await screen.findByRole("dialog"));
    expect(
      within(drawer.getByText("内容编辑").closest("tr")!).getByRole("checkbox")
    ).toBeChecked();
    expect(
      within(drawer.getByText("高频操作").closest("tr")!).getByRole("checkbox")
    ).toBeChecked();
  });

  it("权限列表按标签保存的颜色显示", async () => {
    mount();
    const row = (await screen.findByText("编辑本人词条")).closest("tr")!;
    expect(within(row).getByText("内容编辑").closest(".ant-tag")).toHaveClass(
      "ant-tag-blue"
    );
    expect(within(row).getByText("高频操作").closest(".ant-tag")).toHaveClass(
      "ant-tag-purple"
    );
  });

  it("新建标签可选择自定义颜色", async () => {
    const create = vi
      .spyOn(api.permissionSystem, "createTag")
      .mockResolvedValue({
        id: "custom",
        name: "自定义标签",
        color: "#2053FF",
        version: 0,
        permissions: []
      });
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByRole("button", { name: "标签管理" }));
    fireEvent.click(screen.getByRole("button", { name: "新建标签" }));
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "自定义标签" }
    });
    fireEvent.click(screen.getByRole("radio", { name: "自定义" }));
    expect(screen.getByRole("radio", { name: "自定义" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith("自定义标签", "#2053FF")
    );
  });

  it("添加标签需二次确认，取消确认不写入", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(
      document.querySelector(
        'tr[data-row-key="words.access"] input[type="checkbox"]'
      )!
    );
    fireEvent.click(screen.getByText("标签管理"));
    const row = within(document.querySelector(".ant-drawer")!)
      .getByText("内容编辑")
      .closest("tr")!;
    expect(within(row).getByRole("checkbox")).not.toBeChecked();
    chooseTagRow("内容编辑");
    expect(screen.getByText("确认添加至标签")).toBeInTheDocument();
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    expect(within(row).getByRole("checkbox")).not.toBeChecked();
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
  });

  it("标签写入暂时失败后保留确认弹窗，可直接重试", async () => {
    const change = vi
      .mocked(api.permissionSystem.changeTags)
      .mockRejectedValueOnce(new Error("网络异常"))
      .mockResolvedValue(catalog.tags);
    mount();
    const row = (await screen.findByText("编辑本人词条")).closest("tr")!;
    fireEvent.click(
      within(row).getByRole("button", { name: "从内容编辑移除编辑本人词条" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));
    await screen.findByText("网络异常");
    expect(screen.getByText("确认从标签移除")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));
    await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText("确认从标签移除")).not.toBeVisible()
    );
  });

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
  it("权限行可直接移除单个标签，保留其他标签和管理员授权", async () => {
    vi.mocked(api.permissionSystem.catalog)
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue({
        ...catalog,
        tags: catalog.tags.map((tag) =>
          tag.id === "t1" ? { ...tag, version: 4, permissions: [] } : tag
        )
      });
    mount();
    const row = (await screen.findByText("编辑本人词条")).closest("tr")!;
    fireEvent.click(
      within(row).getByRole("button", { name: "从内容编辑移除编辑本人词条" })
    );
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    expect(screen.getByText("确认从标签移除")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    fireEvent.click(
      within(row).getByRole("button", { name: "从内容编辑移除编辑本人词条" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [
          { tag_id: "t1", expected_version: 3, add: [], remove: ["words.edit"] }
        ]
      })
    );
    await waitFor(() => expect(within(row).queryByText("内容编辑")).toBeNull());
    expect(within(row).getByText("高频操作")).toBeInTheDocument();
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("权限行的标签摘要入口打开同一抽屉，不覆盖表格原有选择", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    const selectedRow = chooseRow("查看用户");
    const row = screen.getByText("编辑本人词条").closest("tr")!;
    fireEvent.click(
      within(row).getByRole("button", {
        name: "设置编辑本人词条标签"
      })
    );
    const drawer = within(await screen.findByRole("dialog"));
    expect(drawer.getByText("设置标签 · 编辑本人词条")).toBeInTheDocument();
    expect(
      within(drawer.getByText("内容编辑").closest("tr")!).getByRole("checkbox")
    ).toBeChecked();
    expect(selectedRow.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
  });
  it("关闭标签管理时不修改标签归属", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    expect(screen.queryByText("设置标签")).toBeNull();
    expect(screen.queryByText("新建标签")).toBeNull();
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("标签管理"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("已选 1 项权限")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("搜索标签"), {
      target: { value: "内容" }
    });
    expect(within(dialog).queryByText("高频操作")).toBeNull();
    fireEvent.click(dialog.querySelector(".ant-drawer-close")!);
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("取消已勾选标签即移除所选权限，保留抽屉和管理员授权", async () => {
    vi.mocked(api.permissionSystem.catalog)
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue({
        ...catalog,
        tags: catalog.tags.map((tag) =>
          tag.id === "t1" ? { ...tag, version: 4, permissions: [] } : tag
        )
      });
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("标签管理"));
    chooseTagRow("内容编辑");
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
    confirmTagChange("移除");
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [
          { tag_id: "t1", expected_version: 3, add: [], remove: ["words.edit"] }
        ]
      })
    );
    expect(screen.getByText("标签列表")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(
          within(document.querySelector(".ant-drawer")!)
            .getByText("内容编辑")
            .closest("tr")!
        ).getByRole("checkbox")
      ).not.toBeChecked()
    );
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("标签目录提供新建、编辑和删除，不修改管理员授权", async () => {
    const create = vi
      .spyOn(api.permissionSystem, "createTag")
      .mockResolvedValue({
        id: "t3",
        name: "审核",
        color: "default",
        version: 1,
        permissions: []
      });
    const update = vi
      .spyOn(api.permissionSystem, "updateTag")
      .mockResolvedValue(undefined);
    const remove = vi
      .spyOn(api.permissionSystem, "deleteTag")
      .mockResolvedValue(undefined);
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByText("标签管理"));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(drawer).getByText("新建标签"));
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "审核" }
    });
    fireEvent.click(screen.getByRole("radio", { name: "绿色" }));
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("审核", "green"));
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).not.toBeVisible()
    );
    const row = within(drawer).getByText("内容编辑").closest("tr")!;
    fireEvent.click(within(row).getByText("编辑"));
    expect(screen.getByRole("radio", { name: "蓝色" })).toBeChecked();
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "词条维护" }
    });
    fireEvent.click(screen.getByRole("radio", { name: "紫色" }));
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("t1", "词条维护", "purple", 3)
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
  it("新建标签后可在同一抽屉为已选权限打标", async () => {
    const newTag = {
      id: "t3",
      name: "审核标签",
      color: "default",
      version: 0,
      permissions: []
    };
    vi.mocked(api.permissionSystem.catalog)
      .mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce({ ...catalog, tags: [...catalog.tags, newTag] })
      .mockResolvedValue({
        ...catalog,
        tags: [
          ...catalog.tags,
          { ...newTag, version: 1, permissions: ["words.edit"] }
        ]
      });
    vi.spyOn(api.permissionSystem, "createTag").mockResolvedValue(newTag);
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    fireEvent.click(screen.getByText("标签管理"));
    fireEvent.click(screen.getByText("新建标签"));
    fireEvent.change(screen.getByLabelText("标签名称"), {
      target: { value: "审核标签" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await screen.findByText("审核标签");
    chooseTagRow("审核标签");
    confirmTagChange("添加");
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenCalledWith({
        catalog_version: "v1",
        targets: [
          { tag_id: "t3", expected_version: 0, add: ["words.edit"], remove: [] }
        ]
      })
    );
    await waitFor(() =>
      expect(
        within(
          within(document.querySelector(".ant-drawer")!)
            .getByText("审核标签")
            .closest("tr")!
        ).getByRole("checkbox")
      ).toBeChecked()
    );
    expect(screen.getByText("标签列表")).toBeInTheDocument();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("标签重名时保留新建表单和输入，允许修改后重试", async () => {
    const create = vi
      .spyOn(api.permissionSystem, "createTag")
      .mockRejectedValueOnce(new HttpError(409, "conflict"))
      .mockResolvedValue({
        id: "t3",
        name: "新的标签",
        color: "default",
        version: 0,
        permissions: []
      });
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByText("标签管理"));
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
    await waitFor(() =>
      expect(create).toHaveBeenLastCalledWith("新的标签", "default")
    );
    await waitFor(() =>
      expect(screen.getByLabelText("标签名称")).not.toBeVisible()
    );
  });
  it("编辑名称冲突保留表单，但版本冲突仍要求重新查看", async () => {
    vi.spyOn(api.permissionSystem, "updateTag").mockRejectedValue(
      new HttpError(409, "conflict")
    );
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(screen.getByText("标签管理"));
    const drawer = document.querySelector(".ant-drawer")!;
    fireEvent.click(
      within(
        within(drawer as HTMLElement)
          .getByText("内容编辑")
          .closest("tr")!
      ).getByText("编辑")
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
  it("标签被他人删除时刷新列表，可在剩余标签重试", async () => {
    vi.mocked(api.permissionSystem.catalog)
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue({ ...catalog, tags: [catalog.tags[1]!] });
    vi.mocked(api.permissionSystem.changeTags).mockRejectedValueOnce(
      new HttpError(404, "tag not found")
    );
    mount();
    await screen.findByText("编辑本人词条");
    fireEvent.click(
      document.querySelector(
        'tr[data-row-key="words.access"] input[type="checkbox"]'
      )!
    );
    fireEvent.click(screen.getByText("标签管理"));
    chooseTagRow("内容编辑");
    confirmTagChange("添加");
    await screen.findByText("标签已被删除，请重新选择");
    expect(
      within(document.querySelector(".ant-drawer")!).queryByText("内容编辑")
    ).toBeNull();
    expect(api.permissionSystem.catalog).toHaveBeenCalledTimes(2);
    chooseTagRow("高频操作");
    confirmTagChange("添加");
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenLastCalledWith({
        catalog_version: "v1",
        targets: [
          {
            tag_id: "t2",
            expected_version: 5,
            add: ["words.access"],
            remove: []
          }
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
    const row = document.querySelector('tr[data-row-key="words.edit"]')!;
    expect(within(row as HTMLElement).getByText("内容编辑")).toBeVisible();
    expect(within(row as HTMLElement).getByText("高频操作")).toBeVisible();
    expect(
      document.querySelector('tr[data-row-key="words.access"]')
    ).toBeNull();
    expect(screen.queryByText("查看用户")).toBeNull();
    expect(api.permissionSystem.preview).not.toHaveBeenCalled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });
  it("按标签筛选时优先显示命中的标签", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    await selectTag("权限标签", "高频操作");
    const row = document.querySelector('tr[data-row-key="words.edit"]')!;
    expect(within(row as HTMLElement).getByText("高频操作")).toBeVisible();
    expect(within(row as HTMLElement).getByText("内容编辑")).toBeVisible();
    expect(
      row.querySelectorAll("td")[6]?.querySelector(".ant-tag")?.textContent
    ).toContain("高频操作");
  });
  it("两个标签在单元格中同一行展示", async () => {
    mount();
    const row = (await screen.findByText("编辑本人词条")).closest("tr")!;
    const tagCell = row.querySelectorAll("td")[6]!;
    const visibleTags = tagCell.querySelectorAll(".ant-tag");
    expect(visibleTags).toHaveLength(2);
    expect(visibleTags[0]).toHaveTextContent("内容编辑");
    expect(visibleTags[1]).toHaveTextContent("高频操作");
    expect(tagCell.firstElementChild).toHaveStyle("white-space: nowrap");
    expect(
      tagCell.querySelector('[aria-label="查看编辑本人词条其余1个标签"]')
    ).toBeNull();
    expect(
      tagCell.querySelector('[aria-label="设置编辑本人词条标签"]')
    ).not.toBeNull();
  });
  it("十几个标签在表格中保持单行，并可打开完整列表", async () => {
    const manyTags = Array.from({ length: 13 }, (_, index) => ({
      id: `many-${index}`,
      name: `测试标签${index + 1}`,
      color: "default",
      version: 0,
      permissions: ["words.edit"]
    }));
    vi.mocked(api.permissionSystem.catalog).mockResolvedValue({
      ...catalog,
      tags: manyTags
    });
    mount();
    const row = (await screen.findByText("编辑本人词条")).closest("tr")!;
    expect(within(row).getByText("测试标签1")).toBeVisible();
    expect(within(row).getByText("测试标签2")).toBeVisible();
    expect(within(row).queryByText("测试标签13")).toBeNull();
    fireEvent.click(
      within(row).getByRole("button", { name: "查看编辑本人词条其余11个标签" })
    );
    const drawer = within(await screen.findByRole("dialog"));
    expect(drawer.getByText("设置标签 · 编辑本人词条")).toBeInTheDocument();
    expect(drawer.getAllByRole("checkbox")).toHaveLength(13);
  });
  it("多权限部分归属显示半选，勾选时只补齐缺失权限", async () => {
    mount();
    await screen.findByText("编辑本人词条");
    chooseRow("编辑本人词条");
    chooseRow("查看用户");
    fireEvent.click(screen.getByText("标签管理"));
    const row = within(document.querySelector(".ant-drawer")!)
      .getByText("内容编辑")
      .closest("tr")!;
    expect(row.querySelector(".ant-checkbox-indeterminate")).not.toBeNull();
    expect(within(row).getByText("1/2")).toBeInTheDocument();
    chooseTagRow("内容编辑");
    confirmTagChange("添加");
    await waitFor(() =>
      expect(api.permissionSystem.changeTags).toHaveBeenCalledOnce()
    );
    expect(api.permissionSystem.changeTags).toHaveBeenCalledWith({
      catalog_version: "v1",
      targets: [
        {
          tag_id: "t1",
          expected_version: 3,
          add: ["users.access"],
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
