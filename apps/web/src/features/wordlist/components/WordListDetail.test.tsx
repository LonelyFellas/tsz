import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { MeResponse, WordlistEntry, Wordlist } from "@tsz/types";
import { useUserStore } from "@/stores/user";
import { WordListDetail } from "./WordListDetail";
const identity = vi.hoisted(() => ({
  identity: "student",
  ready: true,
  error: null
}));
vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: () => identity
}));
vi.mock("./WordlistTips", () => ({ TipPanel: () => null }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      get: vi.fn(),
      myDetail: vi.fn(),
      items: vi.fn(),
      myItems: vi.fn(),
      reviews: vi.fn()
    },
    auth: { me: vi.fn() }
  }
}));
import { api } from "@/lib/request";
const list: Wordlist = {
  id: "list",
  name: "阅读测试",
  owner_name: "作者",
  owner_user_id: "owner",
  state: "published",
  revision: 1,
  item_count: 51,
  created_at: "",
  updated_at: ""
};
const rich = (text: string) => ({
  version: 1 as const,
  text,
  spans: [],
  liaisons: []
});
const entry: WordlistEntry = {
  entry_id: "entry",
  publication_id: "publication",
  kind: "word",
  label: "apple",
  pos: [
    {
      pos_id: "pos",
      pos: "noun",
      forms: [],
      grammar_structures: [],
      senses: [
        {
          id: "sense",
          sub_pos: "countable",
          level: "C2",
          definitions: ["A1", "C2"].map((level) => ({
            id: level,
            level,
            definition_mode: "en_definition",
            grammar_structure_id: null,
            texts: [
              { dialect: "uk", content: rich(`${level}-UK`) },
              { dialect: "us", content: rich(`${level}-US`) }
            ]
          }))
        }
      ]
    }
  ]
};
const profile = (settings: MeResponse["learning_settings"]) =>
  ({ learning_settings: settings }) as MeResponse;
const settings = {
  cefr_level: "A1",
  english_variant: "BrE"
} as MeResponse["learning_settings"];
const user = (id: string) => ({
  id,
  display_name: id,
  avatar_url: "",
  roles: ["student" as const],
  active_role: "student" as const
});
beforeEach(() => {
  vi.clearAllMocks();
  identity.identity = "student";
  useUserStore.setState({ hydrated: true, user: user("owner") });
  const result = {
    items: [{ entry_id: "entry", position: 0, entry }],
    revision: 1,
    pagination: { page: 1, page_size: 50, total: 51, total_pages: 2 }
  };
  vi.mocked(api.wordList.get).mockResolvedValue(list);
  vi.mocked(api.wordList.myDetail).mockResolvedValue(list);
  vi.mocked(api.wordList.items).mockResolvedValue(result);
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    ...result,
    items: result.items.map((item) => ({
      ...item,
      private_note: "作者秘密",
      note_revision: 1
    }))
  });
  vi.mocked(api.wordList.reviews).mockResolvedValue({
    items: [],
    withdraw_reason: null
  });
  vi.mocked(api.auth.me).mockResolvedValue(profile(settings));
});
function open(mine = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const element = () => (
    <QueryClientProvider client={client}>
      <WordListDetail id="list" mine={mine} />
    </QueryClientProvider>
  );
  const result = render(element());
  return { client, ...result, refresh: () => result.rerender(element()) };
}
it("switches real modes and reading context without writing preferences or leaking private responses", async () => {
  const view = open(true);
  await screen.findByText("A1-UK");
  expect(screen.getByText("私密备注：作者秘密")).toBeVisible();
  expect(screen.getByRole("button", { name: "标准模式" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  fireEvent.click(screen.getByRole("button", { name: "完整模式" }));
  await waitFor(() =>
    expect(api.wordList.myItems).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "", view: "full" },
      expect.anything()
    )
  );
  await screen.findByText("细分词性");
  identity.identity = "teacher";
  view.refresh();
  await screen.findByText("C2-UK");
  expect(screen.queryByText("A1-UK")).not.toBeInTheDocument();
  identity.identity = "student";
  await act(async () => {
    view.client.setQueryData(
      ["wordlists", "user", "owner", "reading-settings"],
      profile({
        ...settings,
        english_variant: "AmE"
      } as MeResponse["learning_settings"])
    );
  });
  view.refresh();
  await screen.findByText("A1-US");
  vi.mocked(api.auth.me).mockResolvedValue(profile(null));
  await act(async () => {
    useUserStore.setState({ user: user("other") });
  });
  await screen.findByText("C2-US");
  expect(screen.getByText(/C2 预览/)).toBeVisible();
  view.unmount();
  useUserStore.setState({ user: null });
  open();
  await screen.findByText("C2-UK");
  expect(screen.queryByText(/作者秘密/)).not.toBeInTheDocument();
  expect(api.wordList.items).toHaveBeenCalled();
});
it("search resets pagination and unsupported full mode can return to the standard response", async () => {
  open();
  await screen.findByText("A1-UK");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 2, q: "" },
      expect.anything()
    )
  );
  fireEvent.change(screen.getByLabelText("搜索词条"), {
    target: { value: "app" }
  });
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "app" },
      expect.anything()
    )
  );
  vi.mocked(api.wordList.items).mockRejectedValueOnce(
    new Error("unsupported view")
  );
  fireEvent.click(screen.getByRole("button", { name: "完整模式" }));
  await screen.findByText(/完整内容暂不可用，可切回标准模式/);
  fireEvent.click(screen.getByRole("button", { name: "标准模式" }));
  await screen.findByText("A1-UK");
});
