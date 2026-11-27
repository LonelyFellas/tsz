import { useLayoutEffect, type ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes
} from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminProfile, UpdateAdminPreferencesResponse } from "@tsz/types";
import { InterfacePreferencesProvider } from "@tsz/shared/i18n/react";
import { api, authRuntime, useAuthStore } from "@/lib/auth";
import { interfacePreferences } from "@/lib/interface-preferences";
import { InterfaceLanguage } from "@/features/settings/InterfaceLanguage";
import { RootProviders } from "@/providers";
import { RouteErrorPage } from "@/pages/RouteError";
import { adminShellResources, useAdminTranslation } from "./index";
import { AdminLocaleEffects } from "./effects";

const restore = vi.hoisted(() =>
  vi.fn(() => ({ retry: vi.fn(), retrying: false }))
);
vi.mock("@/features/auth/hooks/useAdminSessionRestore", () => ({
  useAdminSessionRestore: restore
}));
vi.mock("@/features/recovery/RecoverySession", () => ({
  RecoverySession: () => null
}));

const profile: AdminProfile = {
  id: "locale-first-paint",
  phone: "10000000000",
  display_name: "Locale fixture",
  role: "super_admin",
  permission_version: 1,
  catalog_version: "v1",
  permissions: [],
  preferences: { dialect: "uk", interface_locale: "en-US" }
};
const directory = {
  schema_version: 1,
  preference_version: 1,
  default_locale: "zh-Hans",
  supported_locales: ["zh-Hans", "en-US"]
};
const frames: string[] = [];
function Probe() {
  const { t, i18n } = useAdminTranslation();
  useLayoutEffect(() => {
    frames.push(i18n.language);
  });
  return (
    <>
      <h1>{t("nav_platform")}</h1>
      <input aria-label="draft" />
    </>
  );
}
function Harness({ page = <Probe /> }: { page?: ReactNode }) {
  const sessionKey = useAuthStore(() => interfacePreferences.sessionKey());
  return (
    <InterfacePreferencesProvider
      controller={interfacePreferences}
      sessionKey={sessionKey}
      resources={adminShellResources}
    >
      <AdminLocaleEffects />
      <MemoryRouter>
        <Routes>
          <Route element={<RootProviders />}>
            <Route path="/" element={page} />
          </Route>
        </Routes>
      </MemoryRouter>
    </InterfacePreferencesProvider>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(async () => {
  frames.length = 0;
  localStorage.clear();
  document.title = "天生会背";
  authRuntime.tokens.setAccessToken("locale-fixture");
  authRuntime.clearSession();
  useAuthStore.setState({
    hydrated: false,
    connectionError: false,
    refreshUnconfirmed: false,
    permissionModelIncompatible: false
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json(directory)
  );
  vi.spyOn(api, "profile").mockResolvedValue(profile);
  await interfacePreferences.refresh();
});
afterEach(() => {
  vi.restoreAllMocks();
  authRuntime.tokens.setAccessToken(null);
});

it("大刷新等待身份和账号偏好，首个业务画面直接使用英文", async () => {
  const preference = deferred<AdminProfile>();
  vi.mocked(api.profile).mockReturnValue(preference.promise);
  render(<Harness />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(document.title).toBe("天生会背");
  await act(async () => useAuthStore.getState().setProfile(profile));
  expect(screen.queryByRole("heading")).toBeNull();
  await act(async () => preference.resolve(profile));
  await waitFor(() => expect(screen.getByRole("heading")).toBeInTheDocument());
  expect(frames.length).toBeGreaterThan(0);
  expect(new Set(frames)).toEqual(new Set(["en-US"]));
  expect(document.documentElement.lang).toBe("en-US");
});

it("同一次回焦共用 profile，语言目录未返回时仍能在下次回焦同步权限", async () => {
  vi.mocked(api.profile).mockRestore();
  authRuntime.persistSession({ access_token: "locale-focus", expires_in: 900 });
  useAuthStore.getState().setProfile(profile);
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockImplementation(async (url) =>
    Response.json(String(url).endsWith("/admin/profile") ? profile : directory)
  );
  render(<Harness />);
  await screen.findByRole("heading");
  expect(document.documentElement.lang).toBe("en-US");

  const capabilities = deferred<void>();
  let permissions = ["words.access"];
  const profileRequests = () =>
    fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/admin/profile")
    );
  fetchMock.mockClear();
  fetchMock.mockImplementation(async (url) =>
    String(url).endsWith("/admin/profile")
      ? Response.json({
          ...profile,
          permission_version: permissions.length + 1,
          permissions,
          preferences: { dialect: "uk", interface_locale: "zh-Hans" }
        })
      : capabilities.promise.then(() => Response.json(directory))
  );
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(useAuthStore.getState().profile?.permissions).toEqual([
    "words.access"
  ]);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(profileRequests()).toHaveLength(1);

  permissions = ["words.access", "words.edit"];
  await act(async () => {
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(useAuthStore.getState().profile?.permissions).toEqual(permissions);
  await act(async () => capabilities.resolve());
  expect(document.documentElement.lang).toBe("zh-Hans");
  expect(profileRequests()).toHaveLength(2);
});

it.each(["成功", "响应丢失"])(
  "保存语言期间回焦仍会更新权限，保存%s后采用服务端语言",
  async (outcome) => {
    authRuntime.persistSession({
      access_token: "locale-focus",
      expires_in: 900
    });
    useAuthStore.getState().setProfile(profile);
    render(<Harness page={<InterfaceLanguage />} />);
    const select = await screen.findByRole("combobox");
    await waitFor(() => expect(select).toBeEnabled());
    expect(document.documentElement.lang).toBe("en-US");

    const saved = deferred<UpdateAdminPreferencesResponse>();
    const update = vi
      .spyOn(api, "updateProfilePreferences")
      .mockReturnValue(saved.promise);
    fireEvent.keyDown(select, { key: "ArrowDown", keyCode: 40 });
    fireEvent.click(await screen.findByText("简体中文"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    const refreshed = {
      ...profile,
      permission_version: 2,
      permissions: ["words.access"]
    };
    vi.mocked(api.profile).mockClear().mockResolvedValue(refreshed);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(useAuthStore.getState().profile?.permissions).toEqual([
      "words.access"
    ]);

    const preferences = { dialect: "uk", interface_locale: "zh-Hans" } as const;
    await act(async () => {
      if (outcome === "成功") saved.resolve({ preferences });
      else {
        vi.mocked(api.profile).mockResolvedValue({ ...refreshed, preferences });
        saved.reject(new TypeError("response lost"));
      }
    });
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-Hans"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.mocked(api.profile)).toHaveBeenCalledTimes(
      outcome === "成功" ? 1 : 2
    );
  }
);

it("目录后台刷新不卸载草稿，换账号在新语言确认前隐藏旧界面", async () => {
  useAuthStore.getState().setProfile(profile);
  await interfacePreferences.refresh();
  render(<Harness />);
  const input = await screen.findByRole("textbox");
  (input as HTMLInputElement).value = "unsaved draft";
  const pending = deferred<AdminProfile>();
  vi.mocked(api.profile).mockReturnValue(pending.promise);
  let refreshing!: Promise<void>;
  act(() => {
    refreshing = interfacePreferences.refresh();
  });
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("unsaved draft");
  await act(async () => {
    pending.resolve(profile);
    await refreshing;
  });
  const next = deferred<AdminProfile>();
  vi.mocked(api.profile).mockReturnValue(next.promise);
  act(() => useAuthStore.getState().setProfile({ ...profile, id: "next" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  await act(async () =>
    next.resolve({
      ...profile,
      id: "next",
      preferences: { dialect: "uk", interface_locale: "zh-Hans" }
    })
  );
  expect(await screen.findByRole("textbox")).not.toBe(input);
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(document.documentElement.lang).toBe("zh-Hans");
  act(() => authRuntime.clearSession());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(await screen.findByRole("textbox")).toHaveValue("");
});

it.each([404, 405, 503])(
  "语言目录 %s 时结束加载，保留会话恢复失败的重试入口",
  async (status) => {
    authRuntime.tokens.setAccessToken(null);
    vi.mocked(fetch).mockImplementation(
      async () => new Response(null, { status })
    );
    useAuthStore.setState({ connectionError: true });
    render(<Harness />);
    await screen.findByRole("heading");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试连接" })).toBeEnabled();
  }
);

it("路由资源错误等待账号语言并启动会话恢复", async () => {
  const preference = deferred<AdminProfile>();
  vi.mocked(api.profile).mockReturnValue(preference.promise);
  const router = createMemoryRouter([
    {
      element: <RootProviders />,
      errorElement: (
        <RootProviders>
          <RouteErrorPage />
        </RootProviders>
      ),
      hydrateFallbackElement: <div />,
      children: [
        {
          path: "/",
          lazy: async () => {
            throw new Error("Failed to fetch dynamically imported module");
          }
        }
      ]
    }
  ]);
  function ErrorHarness() {
    const sessionKey = useAuthStore(() => interfacePreferences.sessionKey());
    return (
      <InterfacePreferencesProvider
        controller={interfacePreferences}
        sessionKey={sessionKey}
        resources={adminShellResources}
      >
        <RouterProvider router={router} />
      </InterfacePreferencesProvider>
    );
  }
  render(<ErrorHarness />);
  await waitFor(() => expect(restore).toHaveBeenCalled());
  expect(screen.queryByText("页面资源加载失败")).toBeNull();
  act(() => useAuthStore.getState().setProfile(profile));
  await act(async () => preference.resolve(profile));
  expect(
    await screen.findByText("Page resources could not be loaded")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reload/i })).toBeEnabled();
});
