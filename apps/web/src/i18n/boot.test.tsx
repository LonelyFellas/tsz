import { useEffect, useLayoutEffect } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createPortal } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  InterfacePreferencesProvider,
  useInterfaceTranslation
} from "@tsz/shared/i18n/react";
import { authRuntime } from "@/lib/auth";
import { useUserStore } from "@/stores/user";
import { interfacePreferences } from "@/lib/interface-preferences";
import { WebLocaleEffects } from "./effects";
import { WebLocaleBoundary, useWebLocaleReady } from "./boot";
import { webLocaleBootScript, webLocaleBootStyle } from "./snapshot";
import GlobalError from "@/app/global-error";

vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams()
}));
const restore = vi.hoisted(() =>
  vi.fn(() => ({ retry: vi.fn(), retrying: false }))
);
vi.mock("@/features/auth/hooks/useSessionRestore", () => ({
  useSessionRestore: restore
}));

const directory = {
  schema_version: 1,
  preference_version: 1,
  default_locale: "zh-Hans",
  supported_locales: ["zh-Hans", "en-US"]
};
const user = {
  id: "locale-a",
  display_name: "Locale fixture",
  avatar_url: "",
  active_role: "student" as const,
  roles: ["student"] as const
};
const frames: string[] = [];
function Probe() {
  const { t, i18n } = useInterfaceTranslation();
  const ready = useWebLocaleReady();
  useLayoutEffect(() => {
    if (ready) frames.push(i18n.language);
  });
  return (
    <>
      <h1>{t("actions.save")}</h1>
      <input aria-label="draft" />
    </>
  );
}
function Harness() {
  const owner = useUserStore(() => interfacePreferences.sessionKey());
  return (
    <InterfacePreferencesProvider
      controller={interfacePreferences}
      sessionKey={owner}
      initialLocale="zh-Hans"
    >
      <WebLocaleBoundary>
        <Probe />
      </WebLocaleBoundary>
    </InterfacePreferencesProvider>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value: T) => resolve(value)
  };
}
beforeEach(async () => {
  localStorage.clear();
  document.cookie = "tsz_web_guest_locale_v1=; Max-Age=0; Path=/";
  authRuntime.clearSession();
  useUserStore.setState({
    hydrated: false,
    connectionError: false,
    refreshUnconfirmed: false
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json(directory)
  );
  await interfacePreferences.refresh();
  frames.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  authRuntime.clearSession();
  document.documentElement.removeAttribute("data-locale-pending");
  window.history.replaceState(null, "", "/");
});
it("根错误页启动会话恢复并等待账号语言", async () => {
  const preference = deferred<"en-US">();
  vi.spyOn(authRuntime.api.interfacePreferences, "get").mockImplementation(
    async () => ({
      preferences: { interface_locale: await preference.promise }
    })
  );
  render(
    <GlobalError
      error={new Error("Failed to fetch dynamically imported module")}
      reset={vi.fn()}
    />
  );
  expect(restore).toHaveBeenCalled();
  expect(screen.queryByText("页面资源加载失败")).toBeNull();
  act(() =>
    useUserStore.setState({
      user: { ...user, roles: ["student"] },
      hydrated: true
    })
  );
  await act(async () => preference.resolve("en-US"));
  expect(
    await screen.findByText("Page resources could not be loaded")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled();
});

it("根错误服务端输出保留无需 JavaScript 的重试入口", () => {
  const html = renderToString(
    <GlobalError
      error={new Error("Failed to fetch dynamically imported module")}
      reset={vi.fn()}
    />
  );
  expect(html).toContain('href=""');
  expect(html).toContain('aria-label="Reload / 重新加载"');
  expect(html).not.toContain("页面资源加载失败");
});

it("英文分享链接在中文浏览器的服务端渲染和访客水合后保持英文", async () => {
  window.history.replaceState(null, "", "/login?lang=en-US");
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-CN"]);
  useUserStore.setState({ hydrated: true });
  function SharedPage() {
    const owner = useUserStore(() => interfacePreferences.sessionKey());
    return (
      <InterfacePreferencesProvider
        controller={interfacePreferences}
        sessionKey={owner}
        initialLocale="en-US"
      >
        <WebLocaleEffects />
        <WebLocaleBoundary>
          <Probe />
        </WebLocaleBoundary>
      </InterfacePreferencesProvider>
    );
  }
  const html = renderToString(<SharedPage />);
  expect(html).toContain("Save");
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const onRecoverableError = vi.fn();
  const root = hydrateRoot(container, <SharedPage />, { onRecoverableError });
  try {
    await waitFor(() =>
      expect(container.querySelector("h1")).toHaveTextContent("Save")
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("en-US"));
    expect(new URL(window.location.href).searchParams.get("lang")).toBe(
      "en-US"
    );
    expect(onRecoverableError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
it("身份与账号偏好未确认时无可见默认文案，首个已确认画面为英文", async () => {
  const preference = deferred<"en-US">();
  vi.spyOn(authRuntime.api.interfacePreferences, "get").mockImplementation(
    async () => ({
      preferences: { interface_locale: await preference.promise }
    })
  );
  render(<Harness />);
  expect(screen.queryByRole("heading")).toBeNull();
  act(() =>
    useUserStore.setState({
      user: { ...user, roles: ["student"] },
      hydrated: true
    })
  );
  expect(screen.queryByRole("heading")).toBeNull();
  frames.length = 0;
  await act(async () => preference.resolve("en-US"));
  expect(await screen.findByRole("heading")).toHaveTextContent("Save");
  expect(new Set(frames)).toEqual(new Set(["en-US"]));
  expect(document.documentElement).not.toHaveAttribute("data-locale-pending");
});
it("后台刷新和失败保留DOM、焦点与草稿；换号/退出不继承旧界面", async () => {
  useUserStore.setState({
    user: { ...user, roles: ["student"] },
    hydrated: true
  });
  const get = vi
    .spyOn(authRuntime.api.interfacePreferences, "get")
    .mockResolvedValue({ preferences: { interface_locale: "en-US" } });
  await interfacePreferences.refresh();
  render(<Harness />);
  const input = await screen.findByRole("textbox");
  input.focus();
  fireEvent.change(input, { target: { value: "unsaved" } });
  get.mockRejectedValueOnce(new Error("offline"));
  await act(async () => interfacePreferences.refresh());
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveValue("unsaved");
  expect(screen.getByRole("heading")).toHaveTextContent("Save");
  const next = deferred<"zh-Hans">();
  get.mockImplementationOnce(async () => ({
    preferences: { interface_locale: await next.promise }
  }));
  act(() =>
    useUserStore.setState({
      user: { ...user, id: "locale-b", roles: ["student"] }
    })
  );
  expect(screen.queryByRole("textbox")).toBeNull();
  await act(async () => next.resolve("zh-Hans"));
  expect(await screen.findByRole("textbox")).not.toBe(input);
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.getByRole("heading")).toHaveTextContent("保存");
  act(() => authRuntime.clearSession());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(await screen.findByRole("textbox")).toHaveValue("");
});
it("保留公开SSR HTML与无JS内容，水合时首屏脚本遮挡内容且无水合错误", async () => {
  const html = renderToString(<Harness />);
  expect(html).toContain("保存");
  expect(html).not.toContain('inert=""');
  const style = document.createElement("style");
  style.textContent = webLocaleBootStyle;
  document.head.append(style);
  Function(webLocaleBootScript)();
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  expect(
    getComputedStyle(container.querySelector("#web-interface")!).visibility
  ).toBe("hidden");
  const onRecoverableError = vi.fn();
  const root = hydrateRoot(container, <Harness />, { onRecoverableError });
  try {
    await act(async () => {});
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("h1")).not.toBeVisible();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    style.remove();
  }
});
it.each([404, 405, 503])(
  "首次目录%s仍释放恢复失败后的重试界面",
  async (status) => {
    authRuntime.tokens.setAccessToken(null);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    useUserStore.setState({ connectionError: true });
    render(<Harness />);
    expect(await screen.findByRole("heading")).toHaveTextContent("保存");
  }
);

it("登录写入token后保留在途资料请求，账号确认后才重建界面", async () => {
  useUserStore.setState({ hydrated: true });
  const aborted = vi.fn();
  function LoginRequest() {
    useEffect(
      () => () => {
        aborted();
      },
      []
    );
    return (
      <button
        onClick={() =>
          authRuntime.persistSession({
            access_token: "fixture-login",
            expires_in: 900
          })
        }
      >
        login
      </button>
    );
  }
  function Tree() {
    const owner = useUserStore(() => interfacePreferences.sessionKey());
    return (
      <InterfacePreferencesProvider
        controller={interfacePreferences}
        sessionKey={owner}
      >
        <WebLocaleBoundary>
          <LoginRequest />
        </WebLocaleBoundary>
      </InterfacePreferencesProvider>
    );
  }
  render(<Tree />);
  const button = await screen.findByRole("button", { name: "login" });
  const slowDirectory = deferred<typeof directory>();
  vi.mocked(fetch).mockImplementationOnce(async () =>
    Response.json(await slowDirectory.promise)
  );
  fireEvent.click(button);
  expect(aborted).not.toHaveBeenCalled();
  expect(button).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "login" })).toBeNull();
  await act(async () => slowDirectory.resolve(directory));
  expect(await screen.findByRole("button", { name: "login" })).toBe(button);
  expect(aborted).not.toHaveBeenCalled();
});

it("身份等待同时遮挡body portal并禁止焦点进入，恢复后重新开放", async () => {
  const style = document.createElement("style");
  style.textContent = webLocaleBootStyle;
  document.head.append(style);
  const view = render(<Harness />);
  const portal = document.createElement("div");
  document.body.append(portal);
  const popup = render(createPortal(<button>portal action</button>, portal));
  try {
    await waitFor(() => expect(portal.inert).toBe(true));
    expect(screen.getByText("portal action")).not.toBeVisible();
    const recovery = document.createElement("button");
    recovery.setAttribute("data-resource-recovery", "");
    recovery.textContent = "Reload";
    document.body.append(recovery);
    await act(async () => {});
    expect(recovery.inert).not.toBe(true);
    expect(recovery).toBeVisible();
    recovery.remove();
    act(() => useUserStore.setState({ hydrated: true }));
    await waitFor(() => expect(portal.inert).toBe(false));
    expect(screen.getByText("portal action")).toBeVisible();
  } finally {
    popup.unmount();
    view.unmount();
    portal.remove();
    style.remove();
  }
});

it("首次ready后登录再次pending，标题立即回品牌并拒绝迟到的旧语言标题", async () => {
  window.history.replaceState(null, "", "/login?returnTo=%2Faccount#section");
  useUserStore.setState({ hydrated: true });
  function Tree() {
    const owner = useUserStore(() => interfacePreferences.sessionKey());
    return (
      <InterfacePreferencesProvider
        controller={interfacePreferences}
        sessionKey={owner}
      >
        <WebLocaleEffects />
        <WebLocaleBoundary>
          <Probe />
        </WebLocaleBoundary>
      </InterfacePreferencesProvider>
    );
  }
  render(<Tree />);
  await waitFor(() => expect(document.title).toBe("Sign in | 天生会背"));
  expect(new URL(window.location.href).searchParams.get("lang")).toBe("en-US");
  expect(new URL(window.location.href).searchParams.get("returnTo")).toBe(
    "/account"
  );
  expect(window.location.hash).toBe("#section");
  const slowDirectory = deferred<typeof directory>();
  vi.mocked(fetch).mockImplementationOnce(async () =>
    Response.json(await slowDirectory.promise)
  );
  act(() =>
    authRuntime.persistSession({
      access_token: "fixture-title-login",
      expires_in: 900
    })
  );
  expect(document.title).toBe("天生会背");
  await act(async () => {
    document.title = "(2) 天生会背";
  });
  expect(document.title).toBe("(2) 天生会背");
  await act(async () => {
    document.title = "登录 | 天生会背";
  });
  expect(document.title).toBe("天生会背");
  await act(async () => slowDirectory.resolve(directory));
  await waitFor(() => expect(document.title).toBe("Sign in | 天生会背"));
});
