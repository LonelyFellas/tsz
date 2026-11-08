import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserResources } from "./UserResources";
const state = vi.hoisted(() => ({
  keys: [] as string[],
  wallet: vi.fn(),
  entries: vi.fn(),
  identityDocuments: vi.fn(),
  identityFile: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  usePermission: (key: string) => state.keys.includes(key),
  api: { users: state }
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <UserResources userId="u1" />
    </QueryClientProvider>
  );
  return { ...render(view()), view };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.keys = [];
  state.wallet.mockResolvedValue({ balance: "9007199254740993" });
  state.entries.mockResolvedValue({
    items: [
      {
        id: "1",
        delta: "100",
        balance_after: "123456",
        created_at: "2026-10-11T01:00:00Z"
      }
    ],
    pagination: { total: 1 },
    snapshot: "1"
  });
  state.identityDocuments.mockResolvedValue([]);
});
describe("用户资源独立授权", () => {
  it("未授权时不展示入口、不请求敏感资源", () => {
    mount();
    expect(screen.queryByText("查看天生币余额")).toBeNull();
    expect(screen.queryByText("查看天生币账单")).toBeNull();
    expect(screen.queryByText("查看身份证件")).toBeNull();
    expect(state.wallet).not.toHaveBeenCalled();
    expect(state.entries).not.toHaveBeenCalled();
    expect(state.identityDocuments).not.toHaveBeenCalled();
    expect(state.identityFile).not.toHaveBeenCalled();
  });
  it("余额按需读取且保持大整数精度，撤权后立即隐藏", async () => {
    state.keys = ["users.read_coin_balance"];
    const result = mount();
    expect(state.wallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("查看天生币余额"));
    expect(
      await screen.findByText("9007199254740993 天生币")
    ).toBeInTheDocument();
    expect(state.entries).not.toHaveBeenCalled();
    state.keys = [];
    result.rerender(result.view());
    expect(screen.queryByText("9007199254740993 天生币")).toBeNull();
  });
  it("仅账单权限不显示缓存中的逐笔余额", async () => {
    state.keys = ["users.read_coin_entries"];
    mount();
    fireEvent.click(screen.getByText("查看天生币账单"));
    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.queryByText("123456")).toBeNull();
    expect(state.wallet).not.toHaveBeenCalled();
  });
  it("无认证材料显示空态，不请求原件", async () => {
    state.keys = ["users.read_identity"];
    mount();
    fireEvent.click(screen.getByText("查看身份证件"));
    await waitFor(() =>
      expect(screen.getByText("暂无已提交的身份证件")).toBeInTheDocument()
    );
    expect(state.identityDocuments).toHaveBeenCalledWith("u1");
    expect(state.identityFile).not.toHaveBeenCalled();
  });
});

it("切换四语保留已展开资源与大整数原文，不提前读取其他资源", async () => {
  state.keys = [
    "users.read_coin_balance",
    "users.read_coin_entries",
    "users.read_identity"
  ];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <UserResources userId="u1" />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  fireEvent.click(screen.getByRole("button", { name: "查看天生币余额" }));
  await screen.findByText("9007199254740993 天生币");
  for (const locale of ["zh-Hant", "en-GB", "en-US"] as const) {
    view.rerender(content(locale));
    expect(state.wallet).toHaveBeenCalledTimes(1);
    expect(state.entries).not.toHaveBeenCalled();
    expect(state.identityDocuments).not.toHaveBeenCalled();
    expect(state.identityFile).not.toHaveBeenCalled();
  }
  expect(screen.getByText("9007199254740993 coins")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "View identity documents" })
  );
  await screen.findByText("No identity documents submitted");
  view.rerender(content("zh-Hant"));
  expect(screen.getByText("尚無已提交的身分證件")).toBeVisible();
  expect(state.identityDocuments).toHaveBeenCalledExactlyOnceWith("u1");
  expect(state.identityFile).not.toHaveBeenCalled();
});

it("余额为一时使用单数，金额字符串不转为 Number", async () => {
  state.keys = ["users.read_coin_balance"];
  state.wallet.mockResolvedValue({ balance: "1" });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <InterfaceI18nProvider locale="en-US">
      <QueryClientProvider client={client}>
        <UserResources userId="u1" />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "View coin balance" }));
  expect(await screen.findByText("1 coin")).toBeVisible();
});

it("已读取证件图片跨语言保持 blob 与文件身份，不重新下载", async () => {
  state.keys = ["users.read_identity"];
  state.identityDocuments.mockResolvedValue([
    {
      id: "file-owned",
      kind: "id_front",
      content_type: "image/png",
      size_bytes: 7
    }
  ]);
  state.identityFile.mockResolvedValue(
    new Blob(["fixture"], { type: "image/png" })
  );
  const oldCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL"),
    oldRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const create = vi.fn(() => "blob:owned-fixture"),
    revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: create
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revoke
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <UserResources userId="u1" />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  try {
    fireEvent.click(screen.getByRole("button", { name: "查看身份证件" }));
    const image = await screen.findByAltText("身份证人像面");
    view.rerender(content("en-US"));
    expect(screen.getByAltText("Identity card front")).toBe(image);
    expect(image).toHaveAttribute("src", "blob:owned-fixture");
    expect(state.identityFile).toHaveBeenCalledExactlyOnceWith(
      "u1",
      "file-owned",
      { signal: expect.any(AbortSignal) }
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    if (oldCreate) Object.defineProperty(URL, "createObjectURL", oldCreate);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (oldRevoke) Object.defineProperty(URL, "revokeObjectURL", oldRevoke);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});
