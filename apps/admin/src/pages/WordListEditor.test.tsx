import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { AdminWordlistEdit } from "@tsz/types";
import { Editor, WordListEditorPage } from "./WordListEditor";
vi.mock("@/lib/auth", () => ({
  api: {
    wordlists: {
      create: vi.fn(),
      update: vi.fn(),
      suggestions: vi.fn(),
      edit: vi.fn()
    }
  },
  useAuthStore: (
    select: (state: {
      profile: { id: string; permission_version: number };
    }) => unknown
  ) => select({ profile: { id: "admin", permission_version: 1 } }),
  usePermission: () => true
}));
import { api } from "@/lib/auth";
const candidate = {
  entry_id: "entry",
  publication_id: "publication",
  label: "apple",
  glosses: ["苹果"]
};
const initial: AdminWordlistEdit = {
  detail: {
    wordlist: {
      id: "list",
      owner_user_id: null,
      owner_name: "管理员",
      name: "公开词表",
      state: "published",
      revision: 7,
      item_count: 1,
      created_at: "",
      updated_at: ""
    },
    review_state: "none",
    recommended: true,
    tip_amount: "0"
  },
  items: [{ entry_id: "entry", admin_note: "笔记", candidate }]
};
function mount(data?: AdminWordlistEdit) {
  const router = createMemoryRouter(
    [
      { path: "/edit", element: <Editor adminId="admin" initial={data} /> },
      { path: "/wordlists", element: <p>返回列表成功</p> }
    ],
    { initialEntries: ["/edit"] }
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.wordlists.suggestions).mockResolvedValue({
    items: [candidate]
  });
});
it("renaming public content requires confirmation and uses current revision", async () => {
  vi.mocked(api.wordlists.update).mockResolvedValue(initial.detail);
  mount(initial);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "改名" }
  });
  fireEvent.click(screen.getByText("保 存"));
  expect(await screen.findByText("保存后转为私密")).toBeInTheDocument();
  expect(api.wordlists.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText(/确.*定|OK/));
  await screen.findByText("返回列表成功");
  expect(api.wordlists.update).toHaveBeenCalledWith("list", {
    expected_revision: 7,
    name: "改名",
    items: [{ entry_id: "entry", admin_note: "笔记" }]
  });
});
it("unmatched rows block saving and navigation protects dirty input", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "新词表" }
  });
  fireEvent.click(screen.getByText("保 存"));
  expect(
    await screen.findByText(/第 1 行：请从搜索结果中选择词汇/)
  ).toBeInTheDocument();
  expect(api.wordlists.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("返回词表列表"));
  expect(await screen.findByText("放弃修改？")).toBeInTheDocument();
  fireEvent.click(screen.getByText("继续编辑"));
  expect(screen.getByLabelText("词表名称")).toHaveValue("新词表");
});
it("uncertain creation retry reuses the request key and keeps the payload", async () => {
  vi.mocked(api.wordlists.create)
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(initial.detail);
  mount();
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "新词表" }
  });
  fireEvent.change(screen.getByLabelText("词汇 1"), {
    target: { value: "app" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple.*苹果/ }));
  fireEvent.click(screen.getByText("保 存"));
  expect(await screen.findByText(/未能确认是否保存成功/)).toBeInTheDocument();
  expect(screen.getByLabelText("词表名称")).toBeDisabled();
  fireEvent.click(screen.getByText("重试保存"));
  await screen.findByText("返回列表成功");
  const calls = vi.mocked(api.wordlists.create).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0]![0]).toEqual(calls[1]![0]);
});
it("user wordlists expose no editable private notes", async () => {
  mount({
    ...initial,
    detail: {
      ...initial.detail,
      wordlist: { ...initial.detail.wordlist, owner_user_id: "user" }
    },
    items: [{ entry_id: "entry", admin_note: "", candidate }]
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("后台备注 1")).not.toBeInTheDocument()
  );
});

it("changing the query cancels the old request and cannot show stale suggestions", async () => {
  let resolveOld: (value: { items: (typeof candidate)[] }) => void = () => {};
  let oldSignal: AbortSignal | undefined;
  vi.mocked(api.wordlists.suggestions).mockImplementation((q, options) => {
    if (q.q === "app") {
      oldSignal = options?.signal;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    }
    return Promise.resolve({
      items: [
        { ...candidate, entry_id: "banana", label: "banana", glosses: ["香蕉"] }
      ]
    });
  });
  mount();
  fireEvent.change(screen.getByLabelText("词汇 1"), {
    target: { value: "app" }
  });
  await waitFor(() => expect(oldSignal).toBeDefined());
  fireEvent.change(screen.getByLabelText("词汇 1"), {
    target: { value: "banana" }
  });
  await screen.findByRole("button", { name: /banana.*香蕉/ });
  expect(oldSignal?.aborted).toBe(true);
  resolveOld({ items: [candidate] });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /apple.*苹果/ })
    ).not.toBeInTheDocument()
  );
});

it("opens from the refreshed snapshot and keeps its revision with dirty fields", async () => {
  const refreshed: AdminWordlistEdit = {
    ...initial,
    detail: {
      ...initial.detail,
      wordlist: { ...initial.detail.wordlist, name: "最新词表", revision: 8 }
    }
  };
  let resolveSnapshot!: (value: AdminWordlistEdit) => void;
  vi.mocked(api.wordlists.edit).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const key = ["admin-wordlists", "admin", "edit", "list", 1];
  client.setQueryData(key, initial);
  const router = createMemoryRouter(
    [
      { path: "/wordlists/:id/edit", element: <WordListEditorPage /> },
      { path: "/wordlists", element: <p>返回列表成功</p> }
    ],
    { initialEntries: ["/wordlists/list/edit"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  expect(screen.queryByLabelText("词表名称")).not.toBeInTheDocument();
  await act(async () => {
    resolveSnapshot(refreshed);
  });
  expect(await screen.findByLabelText("词表名称")).toHaveValue("最新词表");
  fireEvent.change(screen.getByLabelText("后台备注 1"), {
    target: { value: "本次备注" }
  });
  const concurrent: AdminWordlistEdit = {
    ...refreshed,
    detail: {
      ...refreshed.detail,
      wordlist: { ...refreshed.detail.wordlist, name: "他人更新", revision: 9 }
    }
  };
  vi.mocked(api.wordlists.edit).mockResolvedValue(concurrent);
  await act(async () => {
    await client.invalidateQueries({ queryKey: key });
  });
  expect(screen.getByLabelText("词表名称")).toHaveValue("最新词表");
  expect(screen.getByLabelText("后台备注 1")).toHaveValue("本次备注");
  vi.mocked(api.wordlists.update).mockResolvedValue(refreshed.detail);
  fireEvent.click(screen.getByText("保 存"));
  await screen.findByText("返回列表成功");
  expect(api.wordlists.update).toHaveBeenCalledWith("list", {
    expected_revision: 8,
    name: "最新词表",
    items: [{ entry_id: "entry", admin_note: "本次备注" }]
  });
});
