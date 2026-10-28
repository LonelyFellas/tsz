import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { Wordlist, WordlistCustomAudio } from "@tsz/types";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { WordListCreator } from "./WordListCreator";
import { pendingSaveKey } from "../pending-save";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      suggestions: vi.fn(),
      create: vi.fn(),
      edit: vi.fn(),
      myItems: vi.fn(),
      update: vi.fn(),
      myCustomAudio: vi.fn()
    },
    coins: { wallet: vi.fn() }
  }
}));
import { api } from "@/lib/request";
const meta: Wordlist = {
  id: "list",
  name: "我的词表",
  owner_user_id: "one",
  owner_name: "我",
  state: "draft",
  revision: 2,
  item_count: 1,
  created_at: "",
  updated_at: ""
};
const custom = {
  item_id: "custom",
  custom_word: { word: "my phrase", definition: "原释义" },
  author_note: "原注"
};
const job = (status: WordlistCustomAudio["status"]): WordlistCustomAudio => ({
  item_id: "custom",
  job_id: "job",
  word: "my phrase",
  status,
  locales: status === "ready" ? ["en-GB", "en-US"] : []
});
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  useUserStore.setState({
    user: {
      id: "one",
      display_name: "我",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
  vi.mocked(api.wordList.suggestions).mockResolvedValue({ items: [] });
  vi.mocked(api.wordList.create).mockResolvedValue(meta);
  vi.mocked(api.wordList.update).mockResolvedValue(meta);
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [],
    items: [custom]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    items: [
      {
        ...custom,
        entry_id: null,
        entry: null,
        position: 0,
        private_note: "旧私注",
        note_revision: 1
      }
    ],
    revision: 2,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  vi.mocked(api.wordList.myCustomAudio).mockResolvedValue({ items: [] });
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "one",
    balance: "9007199254740993",
    status: "open"
  });
});
async function newCustom() {
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "新词表" }
  });
  fireEvent.change(screen.getByLabelText("词条 1"), {
    target: { value: "my phrase" }
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "创建自定义词条" })
  );
  fireEvent.change(screen.getByLabelText("自定义释义 1"), {
    target: { value: "我的释义" }
  });
}
it("已公开词表仅保存备注时，不显示不适用的语音费用和余额操作", async () => {
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: { ...meta, state: "published" },
    entry_ids: [],
    items: [custom]
  });
  renderWithProviders(<WordListCreator id="list" />);
  expect(
    await screen.findByRole("button", { name: "保存备注" })
  ).toBeInTheDocument();
  expect(await screen.findByLabelText("词条 1")).toBeDisabled();
  expect(screen.queryByText(/语音费用：/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "刷新余额" })
  ).not.toBeInTheDocument();
});
it("默认关闭，勾选不会扣款，确认保存发送双语音总价并刷新当前用户钱包", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <WordListCreator />
    </QueryClientProvider>
  );
  await newCustom();
  expect(
    screen.getByRole("checkbox", { name: "生成语音 1" })
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "生成语音 1" }));
  expect(api.wordList.create).not.toHaveBeenCalled();
  const save = screen.getByRole("button", { name: "支付 2 天生币并保存" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledOnce());
  const request = vi.mocked(api.wordList.create).mock.calls[0]![0];
  expect(request.audio_generation).toEqual({
    item_ids: [request.items[0]!.item_id],
    expected_cost: "2"
  });
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["coins", "user", "one"]
    })
  );
});
it("精确余额不足保留输入，服务端扣款拒绝后仍可修正而不会删除语音命令", async () => {
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "one",
    balance: "1",
    status: "open"
  });
  renderWithProviders(<WordListCreator />);
  await newCustom();
  fireEvent.click(screen.getByRole("checkbox", { name: "生成语音 1" }));
  expect(await screen.findByText(/余额不足，输入已保留/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "支付 2 天生币并保存" })
  ).toBeDisabled();
  expect(screen.getByLabelText("自定义释义 1")).toHaveValue("我的释义");
  vi.mocked(api.coins.wallet).mockResolvedValue({
    owner_type: "user",
    owner_id: "one",
    balance: "2",
    status: "open"
  });
  vi.mocked(api.wordList.create).mockRejectedValue(
    new HttpError(409, "low", [], "coin_insufficient_balance")
  );
  fireEvent.click(screen.getByRole("button", { name: "刷新余额" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "支付 2 天生币并保存" })
    ).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "支付 2 天生币并保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("余额不足");
  expect(screen.getByRole("checkbox", { name: "生成语音 1" })).toBeChecked();
  expect(screen.getByLabelText("词表名称")).toBeEnabled();
});
it.each(["queued", "processing", "ready"] as const)(
  "同项同词面 %s 修改释义和注释不重复收费",
  async (status) => {
    vi.mocked(api.wordList.myCustomAudio).mockResolvedValue({
      items: [job(status)]
    });
    renderWithProviders(<WordListCreator id="list" />);
    await screen.findByLabelText("自定义释义 1");
    await waitFor(() => expect(api.wordList.myCustomAudio).toHaveBeenCalled());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("自定义释义 1"), {
      target: { value: "新释义" }
    });
    fireEvent.change(screen.getByLabelText("注 1"), {
      target: { value: "新注" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(api.wordList.update).toHaveBeenCalled());
    const body = vi.mocked(api.wordList.update).mock.calls[0]![1];
    expect(body.audio_generation).toBeUndefined();
    expect(body.idempotency_key).toEqual(expect.any(String));
    expect(body.content?.items?.[0]).toEqual({
      ...custom,
      custom_word: { ...custom.custom_word, definition: "新释义" },
      author_note: "新注"
    });
  }
);
it("修改词面清除先前勾选，新词面必须主动选择", async () => {
  renderWithProviders(<WordListCreator />);
  await newCustom();
  fireEvent.click(screen.getByRole("checkbox", { name: "生成语音 1" }));
  fireEvent.change(screen.getByLabelText("词条 1"), {
    target: { value: "changed" }
  });
  expect(
    screen.getByRole("checkbox", { name: "生成语音 1" })
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalled());
  expect(
    vi.mocked(api.wordList.create).mock.calls[0]![0].audio_generation
  ).toBeUndefined();
});
it("退款中不可重试，退款完成后需要显式勾选并刷新钱包", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  vi.mocked(api.wordList.myCustomAudio).mockResolvedValue({
    items: [job("refunding")]
  });
  const first = render(
    <QueryClientProvider client={client}>
      <WordListCreator id="list" />
    </QueryClientProvider>
  );
  await screen.findByText("语音未完成，退款处理中");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["coins", "user", "one"]
    })
  );
  first.unmount();
  vi.mocked(api.wordList.myCustomAudio).mockResolvedValue({
    items: [job("refunded")]
  });
  renderWithProviders(<WordListCreator id="list" />);
  const choice = await screen.findByRole("checkbox", { name: "生成语音 1" });
  await waitFor(() => expect(choice).toBeEnabled());
  expect(choice).not.toBeChecked();
  fireEvent.click(choice);
  fireEvent.click(screen.getByRole("button", { name: "支付 2 天生币并保存" }));
  await waitFor(() =>
    expect(api.wordList.update).toHaveBeenCalledWith(
      "list",
      expect.objectContaining({
        content: null,
        audio_generation: { item_ids: ["custom"], expected_cost: "2" },
        idempotency_key: expect.any(String)
      })
    )
  );
});
it.each(["create", "update"] as const)(
  "%s 未知结果冻结完整请求并在刷新后同键重放",
  async (kind) => {
    const first = renderWithProviders(
      <WordListCreator id={kind === "update" ? "list" : undefined} />
    );
    if (kind === "create") await newCustom();
    else await screen.findByLabelText("自定义释义 1");
    const choice = screen.getByRole("checkbox", { name: "生成语音 1" });
    await waitFor(() => expect(choice).toBeEnabled());
    fireEvent.click(choice);
    vi.mocked(api.wordList[kind]).mockRejectedValue(
      new HttpError(408, "timeout")
    );
    const button = screen.getByRole("button", { name: "支付 2 天生币并保存" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByRole("button", { name: "重试保存" });
    expect(screen.getByLabelText("词表名称")).toBeDisabled();
    const args = vi.mocked(api.wordList[kind]).mock.calls[0]!;
    const key = pendingSaveKey("one", kind === "update" ? "list" : undefined);
    expect(sessionStorage.getItem(key)).toContain("expected_cost");
    first.unmount();
    vi.mocked(api.wordList[kind]).mockResolvedValue(meta);
    // Recovery must not depend on a fresh editor snapshot or revision-matched items.
    vi.mocked(api.wordList.edit).mockRejectedValue(
      new Error("snapshot temporarily unavailable")
    );
    vi.mocked(api.wordList.myItems).mockRejectedValue(
      new Error("revision changed")
    );
    renderWithProviders(
      <WordListCreator id={kind === "update" ? "list" : undefined} />
    );
    const retry = await screen.findByRole("button", { name: "重试保存" });
    expect(screen.getByLabelText("词表名称")).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(api.wordList[kind]).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.wordList[kind]).mock.calls[1]).toEqual(args);
    await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  }
);
it.each([401, 403, 404, 409])(
  "未知结果后重试 %s 仍冻结原键，重新登录后可继续确认",
  async (status) => {
    vi.mocked(api.wordList.create)
      .mockRejectedValueOnce(new HttpError(408, "timeout"))
      .mockRejectedValueOnce(new HttpError(status, "rejected"));
    renderWithProviders(<WordListCreator />);
    await newCustom();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(api.wordList.create).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重试保存" })).toBeEnabled()
    );
    expect(screen.getByLabelText("词表名称")).toBeDisabled();
    const original = vi.mocked(api.wordList.create).mock.calls[0]![0];
    const key = pendingSaveKey("one");
    expect(sessionStorage.getItem(key)).toContain(original.idempotency_key);
    const user = useUserStore.getState().user!;
    act(() => useUserStore.setState({ user: null }));
    expect(screen.queryByLabelText("词表名称")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(key)).toContain(original.idempotency_key);
    act(() => useUserStore.setState({ user: { ...user, id: "other" } }));
    expect(screen.getByLabelText("词表名称")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "重试保存" })
    ).not.toBeInTheDocument();
    act(() => useUserStore.setState({ user }));
    expect(screen.getByLabelText("自定义释义 1")).toHaveValue("我的释义");
    expect(screen.getByLabelText("词表名称")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
    expect(
      vi.mocked(api.wordList.create).mock.calls.map(([body]) => body)
    ).toEqual([original, original, original]);
  }
);

it("完成旧请求不会删除同目标的另一条待确认请求", async () => {
  let finish!: (result: Wordlist) => void;
  vi.mocked(api.wordList.create).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  renderWithProviders(<WordListCreator />);
  await newCustom();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledOnce());
  const key = pendingSaveKey("one");
  const other = JSON.stringify({
    request: {
      kind: "create",
      body: { idempotency_key: "another-request", name: "另一份", items: [] }
    },
    form: { name: "另一份", rows: [] }
  });
  sessionStorage.setItem(key, other);
  localStorage.setItem(key, other);
  await act(async () => finish(meta));
  expect(sessionStorage.getItem(key)).toBe(other);
  expect(localStorage.getItem(key)).toBe(other);
});

it.each([
  [" hello ", "hello", true],
  [" \thello\n ", "\thello\n", true],
  ["\thello\n", "hello", false]
])("音频比较遵循 SQL btrim：%j 对 %j", async (word, audioWord, matches) => {
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [],
    items: [
      {
        ...custom,
        custom_word: { ...custom.custom_word, word: word as string }
      }
    ]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    revision: 2,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 },
    items: [
      {
        ...custom,
        custom_word: { ...custom.custom_word, word: word as string },
        entry_id: null,
        entry: null,
        position: 0,
        private_note: "",
        note_revision: 1
      }
    ]
  });
  vi.mocked(api.wordList.myCustomAudio).mockResolvedValue({
    items: [{ ...job("ready"), word: audioWord as string }]
  });
  renderWithProviders(<WordListCreator id="list" />);
  await screen.findByLabelText("自定义释义 1");
  await waitFor(() => expect(api.wordList.myCustomAudio).toHaveBeenCalled());
  if (matches) {
    await screen.findByText("语音已生成");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("自定义释义 1"), {
      target: { value: "新释义" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(api.wordList.update).toHaveBeenCalled());
    expect(vi.mocked(api.wordList.update).mock.calls[0]![1]).toMatchObject({
      content: { items: [{ custom_word: { word, definition: "新释义" } }] }
    });
    expect(
      vi.mocked(api.wordList.update).mock.calls[0]![1].audio_generation
    ).toBeUndefined();
  } else {
    expect(
      await screen.findByRole("checkbox", { name: "生成语音 1" })
    ).toBeEnabled();
  }
});

it("纯平台无键更新响应丢失后遇409解除冻结，可重新打开核对已保存结果", async () => {
  const platform = { item_id: "entry", entry_id: "entry", author_note: "" };
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: ["entry"],
    items: [platform]
  });
  const loaded = {
    revision: 2,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 },
    items: [
      {
        ...platform,
        entry: null,
        position: 0,
        private_note: "",
        note_revision: 1
      }
    ]
  };
  vi.mocked(api.wordList.myItems).mockResolvedValue(loaded);
  vi.mocked(api.wordList.update)
    .mockRejectedValueOnce(new Error("response lost"))
    .mockRejectedValueOnce(new HttpError(409, "revision changed"));
  const first = renderWithProviders(<WordListCreator id="list" />);
  fireEvent.change(await screen.findByLabelText("词表名称"), {
    target: { value: "已保存的新名称" }
  });
  const save = screen.getByRole("button", { name: "保存" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  const retry = await screen.findByRole("button", { name: "重试保存" });
  const body = vi.mocked(api.wordList.update).mock.calls[0]![1];
  expect(body.idempotency_key).toBeUndefined();
  expect(body.audio_generation).toBeUndefined();
  const key = pendingSaveKey("one", "list");
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(screen.getByLabelText("词表名称")).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getByLabelText("词表名称")).toBeEnabled());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "重新打开词表核对保存结果"
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("本次未保存");
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(vi.mocked(api.wordList.update).mock.calls[1]![1]).toEqual(body);
  first.unmount();
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: { ...meta, name: "已保存的新名称", revision: 3 },
    entry_ids: ["entry"],
    items: [platform]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({ ...loaded, revision: 3 });
  renderWithProviders(<WordListCreator id="list" />);
  expect(await screen.findByLabelText("词表名称")).toHaveValue(
    "已保存的新名称"
  );
  expect(
    screen.queryByRole("button", { name: "重试保存" })
  ).not.toBeInTheDocument();
});

it("付费更新响应丢失后遇409仍保留原键，刷新后同键确认", async () => {
  vi.mocked(api.wordList.update)
    .mockRejectedValueOnce(new Error("response lost"))
    .mockRejectedValueOnce(
      new HttpError(409, "conflict", [], "coin_idempotency_conflict")
    );
  const first = renderWithProviders(<WordListCreator id="list" />);
  const choice = await screen.findByRole("checkbox", { name: "生成语音 1" });
  await waitFor(() => expect(choice).toBeEnabled());
  fireEvent.click(choice);
  const save = screen.getByRole("button", { name: "支付 2 天生币并保存" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  fireEvent.click(await screen.findByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(api.wordList.update).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "重试保存" })).toBeEnabled()
  );
  const body = vi.mocked(api.wordList.update).mock.calls[0]![1];
  expect(body.idempotency_key).toEqual(expect.any(String));
  expect(body.audio_generation).toEqual({
    item_ids: ["custom"],
    expected_cost: "2"
  });
  const key = pendingSaveKey("one", "list");
  expect(sessionStorage.getItem(key)).toContain(body.idempotency_key!);
  expect(screen.getByLabelText("词表名称")).toBeDisabled();
  first.unmount();
  renderWithProviders(<WordListCreator id="list" />);
  fireEvent.click(await screen.findByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  expect(
    vi.mocked(api.wordList.update).mock.calls.map(([, request]) => request)
  ).toEqual([body, body, body]);
});

it("旧端点不可用保留文本编辑且普通编辑省略幂等字段", async () => {
  vi.mocked(api.wordList.myCustomAudio).mockRejectedValue(
    new HttpError(404, "missing")
  );
  renderWithProviders(<WordListCreator id="list" />);
  await screen.findByText(/语音暂不可用，仍可编辑文本/);
  fireEvent.change(screen.getByLabelText("自定义释义 1"), {
    target: { value: "仍可改" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(api.wordList.update).toHaveBeenCalled());
  const body = vi.mocked(api.wordList.update).mock.calls[0]![1];
  expect(body.idempotency_key).toBeUndefined();
  expect(body.audio_generation).toBeUndefined();
});
it.each([
  "speech_provider_unavailable",
  "speech_storage_unavailable",
  "speech_voice_not_found"
])("明确同步拒绝 %s 允许主动取消语音保存文本，不静默降级", async (code) => {
  vi.mocked(api.wordList.create).mockRejectedValueOnce(
    new HttpError(503, "unavailable", [], code)
  );
  renderWithProviders(<WordListCreator />);
  await newCustom();
  fireEvent.click(screen.getByRole("checkbox", { name: "生成语音 1" }));
  const save = screen.getByRole("button", { name: "支付 2 天生币并保存" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "本次未保存、未扣款"
  );
  expect(screen.getByLabelText("词表名称")).toBeEnabled();
  expect(screen.getByLabelText("自定义释义 1")).toHaveValue("我的释义");
  expect(screen.getByRole("checkbox", { name: "生成语音 1" })).toBeChecked();
  expect(api.wordList.create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("checkbox", { name: "生成语音 1" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledTimes(2));
  expect(
    vi.mocked(api.wordList.create).mock.calls[1]![0].audio_generation
  ).toBeUndefined();
});
it("费用变化拒绝保留勾选与输入，重新确认时使用新的请求键", async () => {
  vi.mocked(api.wordList.create).mockRejectedValueOnce(
    new HttpError(409, "changed", [], "word_list_audio_cost_changed")
  );
  renderWithProviders(<WordListCreator />);
  await newCustom();
  fireEvent.click(screen.getByRole("checkbox", { name: "生成语音 1" }));
  const save = screen.getByRole("button", { name: "支付 2 天生币并保存" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent("语音费用已变化");
  expect(screen.getByLabelText("自定义释义 1")).toHaveValue("我的释义");
  expect(screen.getByRole("checkbox", { name: "生成语音 1" })).toBeChecked();
  fireEvent.click(save);
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(api.wordList.create).mock.calls;
  expect(second![0].idempotency_key).not.toBe(first![0].idempotency_key);
  expect(second![0].audio_generation).toEqual(first![0].audio_generation);
});
