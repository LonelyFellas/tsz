import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@tsz/ui/admin/overlays";
import { HttpError } from "@tsz/api-client";
import type { LexiconTaxonomy, LexiconTaxonomyKind } from "@tsz/types";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { DomainsPage, RegistersPage } from "@/pages/LexiconTaxonomies";

const row: LexiconTaxonomy = {
  id: "tag-1",
  code: "formal",
  name_zh: "正式",
  name_en: "Formal",
  sort_order: 10,
  revision: 3,
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z"
};
const list = vi.spyOn(api.lexiconTaxonomies, "list");
const create = vi.spyOn(api.lexiconTaxonomies, "create");
const update = vi.spyOn(api.lexiconTaxonomies, "update");
const remove = vi.spyOn(api.lexiconTaxonomies, "remove");
function profile(permissions?: string[]) {
  useAuthStore.getState().setProfile({
    id: "taxonomy-admin",
    phone: "",
    display_name: "配置管理员",
    role: permissions ? "admin" : "super_admin",
    permissions: permissions ?? [],
    permission_version: 1,
    catalog_version: "v1",
    preferences: { dialect: "uk" }
  });
}
function renderPage(kind: LexiconTaxonomyKind = "registers") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <App>{kind === "registers" ? <RegistersPage /> : <DomainsPage />}</App>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
async function openEdit() {
  const cell = await screen.findByText("正式", { selector: "td" });
  fireEvent.click(
    within(cell.closest("tr")!).getByRole("button", { name: /修.*改/ })
  );
  return screen.findByRole("dialog");
}
beforeEach(() => {
  vi.clearAllMocks();
  profile();
  list.mockResolvedValue({
    items: [{ ...row }],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  create.mockResolvedValue({ ...row, id: "tag-2" });
  update.mockResolvedValue({ ...row, revision: 4 });
  remove.mockResolvedValue(undefined);
});

describe("语体/行业配置", () => {
  it.each(["registers", "domains"] as const)(
    "%s 编辑保留类别与版本，成功后重新读取",
    async (kind) => {
      renderPage(kind);
      const dialog = await openEdit();
      expect(within(dialog).getByLabelText("编码")).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText("中文名"), {
        target: { value: " 正式语体 " }
      });
      fireEvent.click(within(dialog).getByRole("button", { name: /保.*存/ }));
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith(kind, row.id, {
          name_zh: "正式语体",
          name_en: "Formal",
          sort_order: 10,
          base_revision: 3
        })
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      expect(
        list.mock.calls.filter(([value]) => value === kind).length
      ).toBeGreaterThan(1);
    }
  );
  it("新增校验后发送配置，重名失败保留输入", async () => {
    create.mockRejectedValue(
      new HttpError(409, "conflict", [], "taxonomy_conflict")
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "新增语体色彩" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /保.*存/ }));
    await screen.findAllByText("请输入有效编码");
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("中文名"), {
      target: { value: "口语" }
    });
    fireEvent.change(within(dialog).getByLabelText("英文名"), {
      target: { value: "Informal" }
    });
    fireEvent.change(within(dialog).getByLabelText("编码"), {
      target: { value: "informal" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /保.*存/ }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith("registers", {
        code: "informal",
        name_zh: "口语",
        name_en: "Informal",
        sort_order: 0
      })
    );
    await screen.findByText("同类别的编码或名称已存在，请修改后重试。");
    expect(within(dialog).getByLabelText("中文名")).toHaveValue("口语");
  });
  it("提交期间不能关闭或重复提交，版本冲突保留编辑", async () => {
    let reject!: (error: Error) => void;
    update.mockImplementation(
      () =>
        new Promise((_, no) => {
          reject = no;
        })
    );
    renderPage();
    const dialog = await openEdit();
    const save = within(dialog).getByRole("button", { name: /保.*存/ });
    fireEvent.click(save);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(
      within(dialog).getByRole("button", { name: /取.*消/ })
    ).toBeDisabled();
    fireEvent.click(save);
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () =>
      reject(new HttpError(409, "stale", [], "revision_conflict"))
    );
    await screen.findByText("此配置已被其他人修改，请关闭后重新打开再编辑。");
    expect(within(dialog).getByLabelText("中文名")).toHaveValue("正式");
  });
  it("删除显式确认，并携带该类别和读取到的版本", async () => {
    renderPage("domains");
    const cell = await screen.findByText("正式", { selector: "td" });
    fireEvent.click(
      within(cell.closest("tr")!).getByRole("button", { name: "删除" })
    );
    expect(remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith("domains", row.id, 3)
    );
  });
  it("无查看权限不发请求；只读用户不能新增编辑或删除", async () => {
    profile([]);
    const view = renderPage();
    expect(screen.getByText("需要词库配置查看权限。")).toBeVisible();
    expect(list).not.toHaveBeenCalled();
    view.unmount();
    profile(["lexicon_settings.access"]);
    renderPage();
    expect(screen.getByRole("button", { name: "新增语体色彩" })).toBeDisabled();
    const cell = await screen.findByText("正式", { selector: "td" });
    expect(
      within(cell.closest("tr")!).getByRole("button", { name: /修.*改/ })
    ).toBeDisabled();
    expect(
      within(cell.closest("tr")!).getByRole("button", { name: "删除" })
    ).toBeDisabled();
  });
  it("读取失败显示重试而不是空列表，重试后恢复", async () => {
    list.mockRejectedValueOnce(new Error("offline"));
    renderPage();
    await screen.findByText("配置加载失败");
    expect(screen.queryByText("暂无语体色彩")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByText("正式", { selector: "td" });
  });
});
