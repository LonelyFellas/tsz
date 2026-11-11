import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { NextCapabilities, NextEntry } from "@tsz/types";
import { bindAdminAuthorizationCache } from "@/lib/adminAuthorization";
import { useAuthStore } from "@/lib/auth";
import { LexiconNextPage, type LexiconNextRequests } from "./LexiconNext";

const id = "00000000-0000-4000-8000-000000000001";
const caps: NextCapabilities = {
  schema_version: 1,
  language_rules_version: "lexicon-next-en-zh-1",
  manual_drafts: true,
  generation: false,
  publishing: false,
  languages: [
    {
      target_language: "en",
      target_locales: ["en-GB", "en-US"],
      medium_locales: ["zh-Hans", "zh-Hant"],
      common_target_locale: "en",
      part_of_speech_codes: ["noun", "verb"]
    }
  ]
};
const entry: NextEntry = {
  id,
  owner_id: "editor",
  target_language: "en",
  kind: "word",
  revision: 1,
  updated_at: "2026-11-11T00:00:00Z",
  draft: { schema_version: 1, headword: "centre", forms: [], senses: [] }
};
function requests() {
  return {
    list: vi.fn(),
    workspaceEntry: vi.fn().mockResolvedValue({ status: "draft" }),
    stats: vi.fn().mockResolvedValue({ total: 0, today: 0, month: 0 }),
    creators: vi.fn().mockResolvedValue([]),
    command: vi.fn(),
    annotation: vi.fn(),
    workspaceList: vi.fn().mockResolvedValue({
      items: [],
      pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
    }),
    capabilities: vi.fn().mockResolvedValue(caps),
    get: vi.fn().mockResolvedValue(structuredClone(entry)),
    create: vi.fn().mockResolvedValue(structuredClone(entry)),
    save: vi.fn().mockImplementation(async (_id, input) => ({
      ...entry,
      revision: input.expected_revision + 1,
      draft: structuredClone(input.draft)
    })),
    view: vi.fn()
  } satisfies LexiconNextRequests;
}
const detachCaches: (() => void)[] = [];
afterEach(() => {
  detachCaches.splice(0).forEach((detach) => detach());
});
function mount(api: LexiconNextRequests, path = `/lexicon-next/${id}`) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  detachCaches.push(bindAdminAuthorizationCache(useAuthStore, client));
  const router = createMemoryRouter(
    [
      {
        path: "/lexicon-next/:entryId?",
        element: <LexiconNextPage requests={api} />
      },
      { path: "/words", element: <p>旧库页面</p> }
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { client, router };
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });
async function edit(label: string, value: string) {
  fireEvent.click(button(label.includes("词形") ? /词性与词形/ : /词义与译词/));
  fireEvent.click(button(`添加${label}`));
  fireEvent.change(await screen.findByRole("textbox", { name: `${label} 1` }), {
    target: { value }
  });
}
beforeEach(() => {
  useAuthStore.setState({
    profile: {
      id: "editor",
      phone: "test-only",
      display_name: "编辑",
      role: "admin",
      permission_version: 1,
      catalog_version: "test",
      permissions: ["words.access", "words.create", "words.edit"],
      preferences: { dialect: "uk" }
    }
  });
});
describe("新版词库手工闭环", () => {
  it("切换四组合保留全部未保存内容和义项身份，完整保存；预览不回写本地稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    await edit("英式英语词形", "centre");
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button("添加义项"));
    await edit("英式英语释义", "the middle");
    await edit("简体中文解释", "中心位置");
    await edit("简体中文译词", "中心");
    fireEvent.click(screen.getByRole("radio", { name: "美式英语" }));
    await edit("美式英语词形", "center");
    await edit("美式英语释义", "the center");
    fireEvent.click(screen.getByRole("radio", { name: "繁体中文" }));
    await edit("繁体中文解释", "中心位置（繁體）");
    await edit("繁体中文译词", "中心處");
    fireEvent.click(screen.getByRole("radio", { name: "英式英语" }));
    fireEvent.click(button(/词性与词形/));
    expect(screen.getByRole("textbox", { name: "英式英语词形 1" })).toHaveValue(
      "centre"
    );
    fireEvent.click(button(/词义与译词/));
    expect(screen.getByDisplayValue("中心位置（繁體）")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "简体中文" }));
    expect(screen.getByDisplayValue("中心位置")).toBeVisible();
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const saved = api.save.mock.calls[0]![1];
    expect(saved.expected_revision).toBe(1);
    expect(saved.draft.forms.map((row: { text: string }) => row.text)).toEqual([
      "centre",
      "center"
    ]);
    expect(saved.draft.senses).toHaveLength(1);
    expect(
      saved.draft.senses[0].definitions.map(
        (row: { locale: string }) => row.locale
      )
    ).toEqual(["en-GB", "zh-Hans", "en-US", "zh-Hant"]);
    const senseId = saved.draft.senses[0].id;
    await screen.findByText("版本 2");
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local unsaved" }
    });
    api.view.mockResolvedValue({
      entry_id: id,
      revision: 2,
      target_locale: "en-GB",
      medium_locale: "zh-Hans",
      forms: [],
      missing_forms: true,
      senses: []
    });
    fireEvent.click(button("查看已保存预览"));
    await screen.findByText("已保存预览 · 版本 2");
    expect(screen.getByDisplayValue("local unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]![1].draft.senses[0].id).toBe(senseId);
  });
  it.each([403, 409])(
    "%s 保留本地草稿，409 比较不会覆盖；显式确认才重载",
    async (status) => {
      const api = requests();
      api.save.mockRejectedValue(new HttpError(status, "rejected"));
      mount(api);
      await screen.findByDisplayValue("centre");
      fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
        target: { value: "local" }
      });
      fireEvent.click(button("保存完整草稿"));
      await screen.findByText(/本地草稿已保留/);
      expect(screen.getByDisplayValue("local")).toBeVisible();
      expect(api.save).toHaveBeenCalledTimes(1);
      if (status === 409) {
        api.get.mockResolvedValue({
          ...entry,
          revision: 5,
          draft: { ...entry.draft, headword: "remote" }
        });
        expect(button("保存完整草稿")).toBeDisabled();
        fireEvent.click(button("比较服务器版本"));
        await screen.findByText("服务器 · 版本 5");
        fireEvent.click(button("保留本地草稿"));
        expect(button("比较服务器版本")).toBeEnabled();
        fireEvent.click(button("比较服务器版本"));
        await screen.findByText("服务器 · 版本 5");
        expect(screen.getByDisplayValue("local")).toBeVisible();
        fireEvent.click(button("放弃本地修改并重载"));
        await screen.findByRole("button", { name: "放弃并重载" });
        fireEvent.click(button("放弃并重载"));
        await screen.findByDisplayValue("remote");
        expect(screen.getByText("版本 5")).toBeVisible();
      }
    }
  );
  it("能力不可用时不请求条目，不回退旧库；无创建/编辑他人权限时禁止写入", async () => {
    const api = requests();
    api.capabilities.mockRejectedValue(new HttpError(404, "not found"));
    const mounted = mount(api);
    await screen.findByText("智能词库手工编辑暂不可用");
    expect(api.get).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    api.capabilities.mockResolvedValue(caps);
    api.get.mockResolvedValue({ ...entry, owner_id: "another-editor" });
    fireEvent.click(button("重新检查"));
    await screen.findByDisplayValue("centre");
    expect(screen.getByRole("textbox", { name: "词头" })).toBeDisabled();
    fireEvent.click(button(/词义与译词/));
    expect(button("添加义项")).toBeDisabled();
    act(() =>
      useAuthStore.setState({
        profile: {
          ...useAuthStore.getState().profile!,
          permissions: ["words.access"]
        }
      })
    );
    await act(() => mounted.router.navigate("/lexicon-next/new"));
    await screen.findByText("当前账号没有创建词条权限");
    expect(button("创建词条")).toBeDisabled();
  });
  it("创建只发送一次；保存 pending 不接收编辑，离开需要确认；重新打开读取新版本", async () => {
    const api = requests();
    let finishCreate!: (entry: NextEntry) => void;
    api.create.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = resolve;
      })
    );
    const { router } = mount(api, "/lexicon-next/new");
    await screen.findByLabelText("词头");
    fireEvent.change(screen.getByLabelText("词头"), {
      target: { value: "centre" }
    });
    fireEvent.click(button("创建词条"));
    fireEvent.click(button("创建词条"));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await act(async () => finishCreate(structuredClone(entry)));
    await screen.findByText("版本 1");
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local" }
    });
    fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
    await screen.findByRole("dialog", { name: "有未保存修改" });
    fireEvent.click(button("继续编辑"));
    expect(screen.getByDisplayValue("local")).toBeVisible();
    let finishSave!: (entry: NextEntry) => void;
    api.save.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    );
    fireEvent.click(button("保存完整草稿"));
    expect(screen.getByRole("textbox", { name: "词头" })).toBeDisabled();
    await act(async () =>
      finishSave({
        ...entry,
        revision: 2,
        draft: { ...entry.draft, headword: "local" }
      })
    );
    fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
    await screen.findByRole("button", { name: "创建词条" });
    api.get.mockResolvedValue({
      ...entry,
      revision: 3,
      draft: { ...entry.draft, headword: "latest" }
    });
    await act(() => router.navigate(`/lexicon-next/${id}`));
    await screen.findByDisplayValue("latest");
    expect(screen.getByText("版本 3")).toBeVisible();
  });
  it("撤销编辑权限后的导航与语言切换不会因缓存清理丢失本地草稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "unsaved after revocation" }
    });
    act(() =>
      useAuthStore.setState({
        profile: {
          ...useAuthStore.getState().profile!,
          permission_version: 2,
          permissions: ["words.access"]
        }
      })
    );
    fireEvent.click(screen.getByRole("radio", { name: "美式英语" }));
    fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
    await screen.findByRole("dialog", { name: "有未保存修改" });
    fireEvent.click(button("继续编辑"));
    expect(screen.getByDisplayValue("unsaved after revocation")).toBeVisible();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("删除义项前确认全部语言范围；取消和校验失败均保留草稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button("添加义项"));
    await edit("英式英语释义", "");
    fireEvent.click(button("保存完整草稿"));
    await screen.findByText(/不能为空/);
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button("删除义项"));
    fireEvent.click(await screen.findByRole("button", { name: /取\s*消/ }));
    expect(
      screen.getByRole("textbox", { name: "英式英语释义 1" })
    ).toBeVisible();
  });
});

it.each([true, false])(
  "空状态按创建权限提供入口，筛选无结果可清空（创建权限：%s）",
  async (canCreate) => {
    if (!canCreate) {
      const profile = useAuthStore.getState().profile!;
      useAuthStore.setState({
        profile: { ...profile, permissions: ["words.access"] }
      });
    }
    const api = requests();
    const { router } = mount(
      api,
      "/lexicon-next?headword=missing&kind=phrase&page=2"
    );
    await screen.findByText("未找到符合条件的数据");
    fireEvent.click(button("重置筛选"));
    await screen.findByText("暂无词条");
    expect(screen.getByRole("searchbox", { name: "词条" })).toHaveValue("");
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20
    });
    const createButtons = screen.queryAllByRole("button", { name: "创建词条" });
    expect(createButtons).toHaveLength(canCreate ? 1 : 0);
    if (canCreate) {
      fireEvent.click(createButtons[0]!);
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/lexicon-next/new")
      );
    }
  }
);

it("越界空页可返回有效页，并保留已应用的筛选条件", async () => {
  const api = requests();
  api.workspaceList
    .mockResolvedValueOnce({
      items: [],
      pagination: { total: 21, page: 3, page_size: 20, total_pages: 2 }
    })
    .mockResolvedValue({
      items: [
        {
          status: "draft",
          forms: [],
          lifecycle_revision: 1,
          annotation: null,
          annotation_revision: 1,
          annotation_visible: false,
          created_at: entry.updated_at,
          created_by_name: "编辑",
          updated_by_name: "编辑",
          id,
          headword: "centre",
          target_language: "en",
          kind: "word",
          owner_id: "editor",
          revision: 2,
          updated_at: entry.updated_at,
          part_of_speech: ["noun"],
          gloss: "中心位置"
        }
      ],
      pagination: { total: 21, page: 2, page_size: 20, total_pages: 2 }
    });
  mount(api, "/lexicon-next?headword=centre&kind=word&page=3&page_size=20");
  await screen.findByText("未找到符合条件的数据");
  expect(button("上一页")).toBeEnabled();
  fireEvent.click(button("上一页"));
  await screen.findByText("centre");
  expect(api.workspaceList).toHaveBeenLastCalledWith({
    headword: "centre",
    kind: "word",
    page: 2,
    page_size: 20
  });
});

it("列表查询筛选与分页走新版接口，列表入口和创建入口使用新版路由", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [
      {
        status: "draft",
        forms: [],
        lifecycle_revision: 1,
        annotation: null,
        annotation_revision: 1,
        annotation_visible: false,
        created_at: entry.updated_at,
        created_by_name: "编辑",
        updated_by_name: "编辑",
        id,
        headword: "centre",
        target_language: "en",
        kind: "word",
        owner_id: "editor",
        revision: 2,
        updated_at: entry.updated_at,
        part_of_speech: ["noun"],
        gloss: "中心位置"
      }
    ],
    pagination: { total: 45, page: 1, page_size: 20, total_pages: 3 }
  });
  const { router } = mount(api, "/lexicon-next");
  await screen.findByText("centre");
  fireEvent.change(screen.getByRole("searchbox", { name: "词条" }), {
    target: { value: "centre" }
  });
  expect(api.workspaceList).toHaveBeenCalledTimes(1);
  fireEvent.click(button("搜索"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      headword: "centre",
      page: 1,
      page_size: 20
    })
  );
  fireEvent.click(button("第 2 页"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      headword: "centre",
      page: 2,
      page_size: 20
    })
  );
  await act(() => router.navigate("/lexicon-next?page_size=10"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 10
    })
  );
  fireEvent.click(button("继续创建"));
  await screen.findByDisplayValue("centre");
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
});

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id,
    headword: "centre",
    target_language: "en",
    kind: "word",
    owner_id: "editor",
    revision: 2,
    lifecycle_revision: 1,
    status: "draft",
    updated_at: entry.updated_at,
    created_at: entry.updated_at,
    created_by_name: "编辑",
    updated_by_name: "编辑",
    part_of_speech: ["noun"],
    gloss: "中心",
    forms: [],
    annotation: null,
    annotation_revision: 1,
    annotation_visible: false,
    ...overrides
  };
}
function grantListPermissions() {
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: [
        "words.access",
        "words.create",
        "words.edit",
        "words.archive",
        "words.restore",
        "words.publish"
      ]
    }
  });
}
it("列表组合条件只在提交后生效，翻页保留，状态切换及移除条件回到第一页", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 45, page: 1, page_size: 20, total_pages: 3 }
  });
  mount(
    api,
    "/lexicon-next?headword=centre&gloss=middle&kind=word&pos=noun&page=2"
  );
  await screen.findByText("centre");
  expect(api.workspaceList).toHaveBeenLastCalledWith({
    headword: "centre",
    gloss: "middle",
    kind: "word",
    pos: "noun",
    page: 2,
    page_size: 20
  });
  fireEvent.change(screen.getByRole("searchbox", { name: "词义" }), {
    target: { value: "中心" }
  });
  expect(api.workspaceList).toHaveBeenCalledTimes(1);
  fireEvent.click(button("搜索"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      headword: "centre",
      gloss: "中心",
      kind: "word",
      pos: "noun",
      page: 1,
      page_size: 20
    })
  );
  fireEvent.click(button("已发布"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "published", page: 1 })
    )
  );
  expect(api.list).not.toHaveBeenCalled();
});
it("批量操作冻结版本、锁住 pending，未知结果沿用同一请求重试；发布入口保持不可用", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  expect(button("批量审听与发布")).toBeDisabled();
  fireEvent.click(button(/移入垃圾桶\(1\)/));
  let reject!: (error: Error) => void;
  api.command
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        })
    )
    .mockResolvedValue({ entry_ids: [id] });
  fireEvent.click(button("移入垃圾桶"));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
  expect(button("取消")).toBeDisabled();
  const sent = api.command.mock.calls[0]![0];
  expect(sent.items).toEqual([
    { entry_id: id, base_revision: 2, base_lifecycle_revision: 1 }
  ]);
  await act(async () => reject(new Error("network")));
  await screen.findByText(/操作结果未确认/);
  fireEvent.click(button("移入垃圾桶"));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(2));
  expect(api.command.mock.calls[1]![0]).toEqual(sent);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
});
it("权限与冲突不丢失选择，垃圾桶固定归档，归档词条打开后只读", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ status: "archived", lifecycle_revision: 2 })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  api.command.mockRejectedValue(new HttpError(409, "词条已变化"));
  api.workspaceEntry.mockResolvedValue({ status: "archived" });
  const { router } = mount(api, "/lexicon-next/trash?status=published");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  expect(api.workspaceList).toHaveBeenLastCalledWith({
    status: "archived",
    page: 1,
    page_size: 20
  });
  expect(button(/永久删除\(1\)/)).toBeDisabled();
  fireEvent.click(button(/恢\s*复\(1\)/));
  fireEvent.click(button("恢复"));
  await screen.findByText("词条已变化");
  expect(button("恢复")).toBeDisabled();
  fireEvent.click(button("取消"));
  expect(
    screen.getByRole("checkbox", { name: "选择「centre」" })
  ).toBeChecked();
  fireEvent.click(button("查看"));
  await screen.findByDisplayValue("centre");
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
  expect(screen.getByRole("textbox", { name: "词头" })).toBeDisabled();
  expect(api.save).not.toHaveBeenCalled();
});
it("标注版本冲突保留输入且可取消，不能盲目重试覆盖", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ annotation_visible: true, annotation: "1" })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  api.annotation.mockRejectedValue(
    new HttpError(409, "标注已变化，请重新打开后确认", [], "revision_conflict")
  );
  mount(api, "/lexicon-next");
  fireEvent.click(
    await screen.findByRole("button", { name: "更多操作：centre" })
  );
  fireEvent.click(await screen.findByText("标注"));
  const field = await screen.findByDisplayValue("1");
  fireEvent.change(field, { target: { value: "2" } });
  fireEvent.click(button("保存标注"));
  await screen.findByText("标注已变化，请重新打开后确认");
  expect(screen.getByDisplayValue("2")).toBeVisible();
  expect(button("保存标注")).toBeDisabled();
  fireEvent.click(button("取消"));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
});
it("从列表创建后同步刷新缓存中的统计，不等待缓存过期", async () => {
  const api = requests();
  const { client, router } = mount(api, "/lexicon-next");
  client.setQueryDefaults(["admin-lexicon-next", "stats"], {
    staleTime: Infinity
  });
  await screen.findByText("暂无词条");
  expect(api.stats).toHaveBeenCalledTimes(1);
  fireEvent.click(button("创建词条"));
  await screen.findByLabelText("词头");
  api.stats.mockResolvedValue({ total: 1, today: 1, month: 1 });
  fireEvent.change(screen.getByLabelText("词头"), {
    target: { value: "centre" }
  });
  fireEvent.click(button("创建词条"));
  await screen.findByDisplayValue("centre");
  await act(() => router.navigate("/lexicon-next"));
  await waitFor(() =>
    expect(client.getQueryData(["admin-lexicon-next", "stats"])).toEqual({
      total: 1,
      today: 1,
      month: 1
    })
  );
});
