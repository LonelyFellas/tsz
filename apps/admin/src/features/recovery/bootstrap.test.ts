import { JSDOM, VirtualConsole } from "jsdom";
import { expect, it, vi } from "vitest";
import { resourceRecoveryScript } from "@tsz/shared/recovery";

async function boot(latest = "B", pathname = "/words", stored = false) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: `https://example.test${pathname}`,
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole()
  });
  const fetch = vi.fn(async (url: URL | RequestInfo) =>
    url === "/version.json"
      ? Response.json({ release_id: latest })
      : new Response(null, { status: 204 })
  );
  dom.window.fetch = fetch;
  dom.window.AbortSignal.timeout = () =>
    new dom.window.AbortController().signal;
  if (stored) dom.window.sessionStorage.setItem("tsz:resource-reload", "1");
  dom.window.eval(resourceRecoveryScript("A", ["/assets/"]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, fetch };
}
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
it("有新版本提示按版本记忆关闭，资源真的失败时仍然给出刷新入口", async () => {
  const { dom } = await boot("B", "/words");
  dom.window.dispatchEvent(new dom.window.Event("tsz:app-ready"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const banner = () =>
    dom.window.document.querySelector(
      "[data-resource-recovery]"
    ) as HTMLElement;
  expect(banner().textContent).toContain("新版本");
  // 关闭是记忆的：同一个版本不再反复打扰。
  const close = banner().querySelector(".tsz-recovery-close") as HTMLElement;
  close.click();
  expect(dom.window.sessionStorage.getItem("tsz:resource-dismissed")).toBe("B");
  expect(banner().style.display).toBe("none");
  // 但资源确实加载失败时，刷新入口不能被「关掉」。
  dom.window.dispatchEvent(new dom.window.Event("vite:preloadError"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(banner().getAttribute("data-tone")).toBe("danger");
  expect(banner().style.display).toBe("");
  dom.window.close();
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
