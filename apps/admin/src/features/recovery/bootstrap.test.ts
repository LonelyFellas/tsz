import { JSDOM, VirtualConsole } from "jsdom";
import { expect, it, vi } from "vitest";
import { resourceRecoveryScript } from "@tsz/shared/recovery";

async function boot(
  latest = "B",
  pathname = "/words",
  stored = false,
  session: { dismissed?: string; versionDown?: boolean } = {}
) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: `https://example.test${pathname}`,
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole()
  });
  const fetch = vi.fn(async (url: URL | RequestInfo) =>
    url === "/version.json"
      ? session.versionDown
        ? new Response(null, { status: 503 })
        : Response.json({ release_id: latest })
      : new Response(null, { status: 204 })
  );
  dom.window.fetch = fetch;
  dom.window.AbortSignal.timeout = () =>
    new dom.window.AbortController().signal;
  if (stored) dom.window.sessionStorage.setItem("tsz:resource-reload", "1");
  if (session.dismissed)
    dom.window.sessionStorage.setItem(
      "tsz:resource-dismissed",
      session.dismissed
    );
  dom.window.eval(resourceRecoveryScript("A", ["/assets/"]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, fetch };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const bannerIn = (dom: JSDOM) =>
  dom.window.document.querySelector<HTMLElement>("[data-resource-recovery]");
it("boot failure shows a native fallback even when the entry module never starts", async () => {
  const { dom, fetch } = await boot();
  const script = dom.window.document.createElement("script");
  script.src = "/assets/entry.js";
  dom.window.document.body.append(script);
  script.dispatchEvent(new dom.window.Event("error"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    dom.window.document.querySelector("[data-resource-recovery]")?.textContent
  ).toContain("新版本");
  expect(
    fetch.mock.calls.some(([url]) =>
      String(url).includes("client-resource-error")
    )
  ).toBe(true);
  expect(dom.window.sessionStorage.getItem("tsz:resource-reload")).toBeNull();
  dom.window.close();
});
it("有新版本提示可关闭，并按版本记忆", async () => {
  const { dom } = await boot("B", "/words");
  dom.window.dispatchEvent(new dom.window.Event("tsz:app-ready"));
  await tick();
  expect(bannerIn(dom)?.textContent).toContain("新版本");
  expect(bannerIn(dom)?.getAttribute("data-dismissible")).toBe("true");
  bannerIn(dom)?.querySelector<HTMLElement>(".tsz-recovery-close")?.click();
  expect(dom.window.sessionStorage.getItem("tsz:resource-dismissed")).toBe("B");
  expect(bannerIn(dom)?.style.display).toBe("none");
  // 记下关闭的版本不再复现。
  const again = await boot("B", "/words", false, { dismissed: "B" });
  again.dom.window.dispatchEvent(new again.dom.window.Event("tsz:app-ready"));
  await tick();
  expect(bannerIn(again.dom)).toBeNull();
  dom.window.close();
  again.dom.window.close();
});
it("资源失败时刷新入口不可关闭，也不被关闭记忆抑制", async () => {
  // 有新版本且有资源失败：文案仍是版本提示，但不能再把刷新入口关掉。
  const stale = await boot("B", "/words", false, { dismissed: "B" });
  stale.dom.window.dispatchEvent(
    new stale.dom.window.Event("vite:preloadError")
  );
  await tick();
  expect(bannerIn(stale.dom)?.getAttribute("data-dismissible")).toBe("false");
  expect(bannerIn(stale.dom)?.style.display).toBe("");
  expect(bannerIn(stale.dom)?.textContent).toContain("新版本");
  stale.dom.window.close();
  // 版本都探测不到（离线）：失败态提示，同样不可关闭。
  const offline = await boot("B", "/words", false, { versionDown: true });
  offline.dom.window.dispatchEvent(
    new offline.dom.window.Event("vite:preloadError")
  );
  await tick();
  expect(bannerIn(offline.dom)?.getAttribute("data-tone")).toBe("danger");
  expect(bannerIn(offline.dom)?.getAttribute("data-dismissible")).toBe("false");
  offline.dom.window.close();
});
it("an image failure does not trigger whole-page recovery", async () => {
  const { dom, fetch } = await boot("A");
  const image = dom.window.document.createElement("img");
  image.src = "/assets/photo.png";
  dom.window.document.body.append(image);
  image.dispatchEvent(new dom.window.Event("error"));
  expect(
    dom.window.document.querySelector("[data-resource-recovery]")
  ).toBeNull();
  expect(fetch.mock.calls.length).toBe(1);
  dom.window.close();
});
it("a safe entrance consumes at most one reload and dirty input blocks automatic recovery", async () => {
  const { dom } = await boot("B", "/login");
  dom.window.dispatchEvent(new dom.window.Event("vite:preloadError"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(dom.window.sessionStorage.getItem("tsz:resource-reload")).toBe("1");
  dom.window.close();
  const dirty = await boot("B", "/login");
  const input = dirty.dom.window.document.createElement("input");
  dirty.dom.window.document.body.append(input);
  input.dispatchEvent(new dirty.dom.window.Event("input", { bubbles: true }));
  dirty.dom.window.dispatchEvent(
    new dirty.dom.window.Event("vite:preloadError")
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    dirty.dom.window.sessionStorage.getItem("tsz:resource-reload")
  ).toBeNull();
  dirty.dom.window.close();
});
