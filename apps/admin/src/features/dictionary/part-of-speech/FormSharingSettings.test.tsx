import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@tsz/ui/admin/overlays";
import { HttpError } from "@tsz/api-client";
import { beforeEach, expect, it, vi } from "vitest";
import type { FormSharingTemplate } from "@tsz/types";
import { useAuthStore } from "@/lib/auth";
import { partOfSpeechCatalogFixture } from "../word-creation/partOfSpeech.test.helper";
import { FormSharingSettings } from "./FormSharingSettings";

const mock = vi.hoisted(() => ({
  catalog: vi.fn(),
  get: vi.fn(),
  save: vi.fn()
}));
vi.mock("../dataSource", () => ({
  partOfSpeechDataSource: {
    catalog: () => mock.catalog(),
    getFormSharing: () => mock.get(),
    updateFormSharing: (input: unknown) => mock.save(input)
  }
}));
const initial: FormSharingTemplate = {
  revision: 2,
  groups: [
    {
      id: "group-1",
      members: [
        {
          part_of_speech_id: partOfSpeechCatalogFixture.items[0]!.id,
          form_type_id: "form-type-base"
        },
        {
          part_of_speech_id: partOfSpeechCatalogFixture.items[1]!.id,
          form_type_id: "form-type-base"
        }
      ]
    }
  ]
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.catalog.mockResolvedValue({
    ...partOfSpeechCatalogFixture,
    form_sharing: initial
  });
  mock.get.mockResolvedValue(initial);
  mock.save.mockResolvedValue({ revision: 3, groups: [] });
  useAuthStore.getState().setProfile({
    id: "admin-1",
    role: "super_admin",
    phone: "",
    display_name: "test",
    permission_version: 1,
    catalog_version: "v1",
    permissions: [],
    preferences: { dialect: "uk" }
  });
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <FormSharingSettings />
      </App>
    </QueryClientProvider>
  );
}
it("先检查 catalog 能力，旧后端不请求可能返回 403 的新端点", async () => {
  mock.catalog.mockResolvedValue(partOfSpeechCatalogFixture);
  setup();
  expect(
    await screen.findByText("当前服务不支持默认共享模板")
  ).toBeInTheDocument();
  expect(mock.get).not.toHaveBeenCalled();
});
it("共享模板使用独立权限，其他配置编辑权不能保存", async () => {
  useAuthStore.getState().setProfile({
    id: "admin-1",
    role: "admin",
    phone: "",
    display_name: "test",
    permission_version: 1,
    catalog_version: "v1",
    permissions: ["lexicon_settings.access", "lexicon_settings.edit_forms"],
    preferences: { dialect: "uk" }
  });
  setup();
  expect(await screen.findByRole("button", { name: /保\s*存/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "新增共享组合" })).toBeDisabled();
  expect(mock.save).not.toHaveBeenCalled();
});
it("删除全部组合持久化为空；失败和后台重新读取均保留本地输入", async () => {
  mock.save.mockRejectedValueOnce(new Error("save failed"));
  setup();
  fireEvent.click(await screen.findByRole("button", { name: /删\s*除/ }));
  fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
  expect(await screen.findByText("save failed")).toBeInTheDocument();
  expect(mock.save).toHaveBeenLastCalledWith({ base_revision: 2, groups: [] });
  expect(screen.getByText("未配置默认共享组合")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
  await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(2));
  expect(screen.getByText("未配置默认共享组合")).toBeInTheDocument();
});
it("不足两个成员不发送；组合使用原 UUID 发送完整稳定 ID", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: /保\s*存/ }));
  await waitFor(() =>
    expect(mock.save).toHaveBeenCalledWith({
      base_revision: 2,
      groups: initial.groups
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "新增共享组合" }));
  fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
  expect(
    await screen.findByText("每个共享组合须选择 2–100 个标签")
  ).toBeInTheDocument();
  expect(mock.save).toHaveBeenCalledTimes(1);
});
it("409 保留编辑且停止重试，只有显式重新加载才放弃本地版本", async () => {
  mock.save.mockRejectedValue(
    new HttpError(409, "stale", [], "revision_conflict")
  );
  setup();
  fireEvent.click(await screen.findByRole("button", { name: /删\s*除/ }));
  fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
  expect(await screen.findByText(/模板已被其他人修改/)).toBeInTheDocument();
  expect(screen.getByText("未配置默认共享组合")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /保\s*存/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  fireEvent.click(await screen.findByRole("button", { name: /取\s*消/ }));
  expect(screen.getByText("未配置默认共享组合")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  const reloadButtons = await screen.findAllByRole("button", {
    name: "重新加载"
  });
  fireEvent.click(reloadButtons.at(-1)!);
  expect(await screen.findByLabelText("共享组合 1")).toBeInTheDocument();
});
