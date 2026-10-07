import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import type { PermissionTag } from "@tsz/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { AdminPermissionEditor } from "./AdminPermissionEditor";

const tags: PermissionTag[] = [
  {
    id: "tag-edit",
    name: "词条编辑",
    color: "blue",
    version: 0,
    permissions: ["words.access", "words.edit"]
  },
  {
    id: "tag-sentence",
    name: "例句查看",
    color: "green",
    version: 0,
    permissions: ["words.access", "sentences.access"]
  },
  {
    id: "tag-empty",
    name: "空标签",
    color: "default",
    version: 0,
    permissions: []
  }
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
  const modules = () => within(screen.getByRole("group", { name: "权限模块" }));
  const detail = () => within(screen.getByRole("region", { name: "权限明细" }));
  const selectedTags = () =>
    within(screen.getByRole("group", { name: "已选权限标签" }));
  const picker = () => within(document.querySelector(".ant-modal")!);
  const openPicker = () =>
    fireEvent.click(screen.getByRole("button", { name: "标签池" }));

  it("优先展示已授权模块，切换模块仍保留其他权限", async () => {
    mount();
    await screen.findByRole("group", { name: "权限模块" });
    expect(modules().getByRole("button", { name: /智能词库/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(detail().getByText("编辑自己的词条及修订")).toBeVisible();
    fireEvent.click(modules().getByRole("button", { name: /多维例句/ }));
    expect(detail().getByText("查看后台共享例句")).toBeVisible();
    expect(detail().queryByText("编辑自己的词条及修订")).toBeNull();
    fireEvent.click(modules().getByRole("button", { name: /智能词库/ }));
    expect(detail().getByLabelText(/编辑词条/)).toBeChecked();
    expect(screen.getByRole("dialog", { name: "权限配置" })).toBeVisible();
    expect(screen.getByText("无变更")).toBeInTheDocument();
    expect(screen.queryByText("words.access")).toBeNull();
    expect(detail().getByText("前置权限：查看词条")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览变更" })).toBeDisabled();
  });

  it("回填已有权限，显示授权对象与权限说明", async () => {
    mount();
    await screen.findByRole("group", { name: "权限模块" });
    const access = detail().getByLabelText(/^查看词条$/);
    expect(access).toBeChecked();
    expect(detail().getByLabelText(/编辑词条/)).toBeChecked();
    expect(detail().getByText("编辑自己的词条及修订")).toBeInTheDocument();
    expect(access.closest("label")).not.toHaveTextContent("前置权限");
    expect(screen.getByText("授权对象")).toBeInTheDocument();
    expect(screen.getByText("管理员甲")).toBeInTheDocument();
  });

  it("零权限账号显示当前数量，未调整时不能预览", async () => {
    mount([]);
    await screen.findByRole("group", { name: "权限模块" });
    expect(screen.getByText("已选权限")).toBeInTheDocument();
    expect(screen.getByText("无变更")).toBeInTheDocument();
    expect(detail().getByLabelText(/^查看词条$/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "预览变更" })).toBeDisabled();
    expect(api.permissionSystem.commit).not.toHaveBeenCalled();
  });

  it("修改当前模块时保留其他模块权限，预览仅撤回被取消的一项", async () => {
    mount(["words.access", "words.edit", "sentences.access"]);
    await screen.findByRole("group", { name: "权限模块" });
    fireEvent.click(detail().getByLabelText(/编辑词条/));
    fireEvent.click(modules().getByRole("button", { name: /多维例句/ }));
    expect(detail().getByLabelText(/例句查看/)).toBeChecked();
    expect(screen.getByText("开通 0 项 · 取消 1 项")).toBeInTheDocument();
    expect(
      modules().getByRole("button", { name: /多维例句/ })
    ).toHaveTextContent("1/1");
    fireEvent.click(screen.getByRole("button", { name: "预览变更" }));
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

  it("标签池显式多选并批量勾选权限，不改标签目录", async () => {
    mount(["words.access"], tags);
    await screen.findByRole("group", { name: "权限模块" });
    vi.spyOn(api.permissionSystem, "changeTags");
    expect(selectedTags().getByText("未选择标签")).toBeInTheDocument();
    openPicker();
    expect(
      picker().getByRole("checkbox", { name: /词条编辑/ })
    ).not.toBeChecked();
    expect(
      picker().getByRole("checkbox", { name: /例句查看/ })
    ).not.toBeChecked();
    expect(picker().queryByText("空标签")).toBeNull();
    fireEvent.click(picker().getByRole("checkbox", { name: /词条编辑/ }));
    fireEvent.click(picker().getByRole("checkbox", { name: /例句查看/ }));
    fireEvent.click(picker().getByRole("button", { name: "确认选择" }));
    expect(selectedTags().getByText("词条编辑")).toBeVisible();
    expect(selectedTags().getByText("例句查看")).toBeVisible();
    expect(
      selectedTags().getByText("词条编辑").closest(".ant-tag")
    ).toHaveClass("ant-tag-blue");
    expect(screen.getByText("开通 2 项 · 取消 0 项")).toBeInTheDocument();
    expect(
      modules().getByRole("button", { name: /多维例句/ })
    ).toHaveTextContent("1/1");
    expect(api.permissionSystem.changeTags).not.toHaveBeenCalled();
  });

  it("取消标签内权限会取消标签选择，手动补回权限也不自动选标签", async () => {
    mount(["words.access"], tags);
    await screen.findByRole("group", { name: "权限模块" });
    openPicker();
    fireEvent.click(picker().getByRole("checkbox", { name: /词条编辑/ }));
    fireEvent.click(picker().getByRole("button", { name: "确认选择" }));
    expect(
      selectedTags().getByRole("button", { name: "词条编辑：移除权限" })
    ).toBeVisible();
    fireEvent.click(detail().getByLabelText(/编辑词条/));
    expect(selectedTags().queryByText("词条编辑")).toBeNull();
    expect(selectedTags().getByText("未选择标签")).toBeInTheDocument();
    fireEvent.click(detail().getByLabelText(/编辑词条/));
    expect(detail().getByLabelText(/编辑词条/)).toBeChecked();
    expect(selectedTags().queryByText("词条编辑")).toBeNull();
  });

  it("标签池取消与上方 × 移除整组权限，保留其他已选标签的重叠权限", async () => {
    mount([], tags);
    await screen.findByRole("group", { name: "权限模块" });
    openPicker();
    fireEvent.click(picker().getByRole("checkbox", { name: /词条编辑/ }));
    fireEvent.click(picker().getByRole("checkbox", { name: /例句查看/ }));
    fireEvent.click(picker().getByRole("button", { name: "确认选择" }));
    expect(screen.getByText("开通 3 项 · 取消 0 项")).toBeInTheDocument();

    openPicker();
    fireEvent.click(picker().getByRole("checkbox", { name: /词条编辑/ }));
    fireEvent.click(picker().getByRole("button", { name: "确认选择" }));
    expect(selectedTags().queryByText("词条编辑")).toBeNull();
    expect(selectedTags().getByText("例句查看")).toBeVisible();
    expect(screen.getByText("开通 2 项 · 取消 0 项")).toBeInTheDocument();
    fireEvent.click(
      selectedTags().getByRole("button", { name: "例句查看：移除权限" })
    );
    expect(selectedTags().getByText("未选择标签")).toBeInTheDocument();
    expect(screen.getByText("无变更")).toBeInTheDocument();
  });

  it("已有权限及手动勾选不会自动回显为已选标签", async () => {
    mount(["words.access", "words.edit"], tags);
    await screen.findByRole("group", { name: "权限模块" });
    expect(selectedTags().getByText("未选择标签")).toBeInTheDocument();
    openPicker();
    expect(
      picker().getByRole("checkbox", { name: /词条编辑/ })
    ).not.toBeChecked();
    fireEvent.click(picker().getByRole("button", { name: /取\s*消/ }));
    fireEvent.click(modules().getByRole("button", { name: /多维例句/ }));
    fireEvent.click(detail().getByLabelText(/例句查看/));
    expect(selectedTags().queryByText("例句查看")).toBeNull();
  });

  it("只有空标签时不开放标签池", async () => {
    mount([], [tags[2]!]);
    await screen.findByRole("group", { name: "权限模块" });
    expect(selectedTags().getByText("暂无可用标签")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标签池" })).toBeDisabled();
  });

  it("标签池可搜索几十个标签，筛选不丢已勾选项", async () => {
    const manyTags: PermissionTag[] = Array.from(
      { length: 36 },
      (_, index) => ({
        id: `tag-${index}`,
        name: `测试标签${index + 1}`,
        color: "default",
        version: 0,
        permissions: ["words.access"]
      })
    );
    mount([], [...manyTags, tags[2]!]);
    await screen.findByRole("group", { name: "权限模块" });
    openPicker();
    expect(
      picker().getAllByRole("checkbox", { name: /测试标签/ })
    ).toHaveLength(36);
    expect(picker().queryByText("空标签")).toBeNull();
    fireEvent.click(
      picker().getByRole("checkbox", { name: "测试标签1，1 项权限" })
    );
    fireEvent.change(picker().getByRole("textbox", { name: "搜索标签" }), {
      target: { value: "测试标签36" }
    });
    expect(
      picker().getAllByRole("checkbox", { name: /测试标签/ })
    ).toHaveLength(1);
    fireEvent.click(picker().getByRole("checkbox", { name: /测试标签36/ }));
    fireEvent.click(picker().getByRole("button", { name: "确认选择" }));
    expect(selectedTags().getByText("测试标签1")).toBeVisible();
    expect(selectedTags().getByText("测试标签36")).toBeVisible();
    expect(selectedTags().queryByText("测试标签2")).toBeNull();
  });

  it("确认页沿用版本和管理员身份，预览显示中文权限", async () => {
    mount();
    await screen.findByRole("group", { name: "权限模块" });
    fireEvent.click(detail().getByLabelText(/编辑词条/));
    fireEvent.click(screen.getByRole("button", { name: "预览变更" }));
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
