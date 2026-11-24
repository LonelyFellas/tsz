import { createServer as createHttpServer } from "node:http";
import { CookieJar } from "jsdom";
import { createServer as createViteServer } from "vite";
import { describe, expect, it } from "vitest";
import { buildAdminDevProxy, DEFAULT_ADMIN_BACKEND_API_URL } from "./dev-proxy";

describe("admin dev proxy", () => {
  it("默认代理到本地 tsz-rust 8383，并保留 /api/v1 基址", () => {
    expect(DEFAULT_ADMIN_BACKEND_API_URL).toBe("http://localhost:8383/api/v1");
    const proxy = buildAdminDevProxy()["/api/v1"];

    expect(proxy.target).toBe("http://localhost:8383");
    expect(proxy.changeOrigin).toBe(true);
    expect(proxy.cookieDomainRewrite).toBe("");
    expect(proxy.rewrite("/api/v1/admin/lexicon/detections")).toBe(
      "/api/v1/admin/lexicon/detections"
    );
  });

  it("支持带自定义基址的测试后端", () => {
    const proxy = buildAdminDevProxy("https://test.example.com/backend/v1/")[
      "/api/v1"
    ];

    expect(proxy.target).toBe("https://test.example.com");
    expect(proxy.rewrite("/api/v1/admin/profile")).toBe(
      "/backend/v1/admin/profile"
    );
  });

  it.each([
    ["not a url", "不是合法 URL"],
    ["ftp://localhost/api/v1", "缺少 http(s) 协议"],
    ["http://localhost:8383", "缺少路径前缀"]
  ])("拒绝非法代理地址 %s", (value, message) => {
    expect(() => buildAdminDevProxy(value)).toThrow(message);
  });
});

it("isolates admin refresh cookies between dev servers on the same host", async () => {
  const apiPath = "/api/v1/admin/auth";
  const cookieName = "admin_refresh_token";
  const jar = new CookieJar();
  let issued = 0;
  const liveSessions = new Set<string>();
  const upstream = createHttpServer((req, res) => {
    const cookie = req.headers.cookie
      ?.split(/;\s*/u)
      .find((pair) => pair.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    const setCookie = (value: string) => {
      res.setHeader(
        "set-cookie",
        `${cookieName}=${value}; Path=${apiPath}; HttpOnly; SameSite=Lax`
      );
    };
    if (req.url === `${apiPath}/login`) {
      const created = String(++issued);
      liveSessions.add(created);
      setCookie(created);
      res.end();
    } else if (cookie && liveSessions.delete(cookie)) {
      if (req.url === `${apiPath}/logout`) {
        setCookie("; Max-Age=0");
      } else {
        const replacement = String(++issued);
        liveSessions.add(replacement);
        setCookie(replacement);
      }
      res.end(cookie);
    } else {
      res.writeHead(401).end();
    }
  });
  const host = "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    upstream.once("error", reject).listen(0, host, resolve);
  });
  const devServers: Awaited<ReturnType<typeof createViteServer>>[] = [];
  try {
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string")
      throw new Error("missing upstream address");
    const proxyUrl = `http://${host}:${upstreamAddress.port}/api/v1`;
    for (let i = 0; i < 2; i++) {
      const server = await createViteServer({
        configFile: false,
        envDir: false,
        server: {
          host,
          port: 0,
          hmr: false,
          proxy: buildAdminDevProxy(proxyUrl)
        }
      });
      devServers.push(server);
      await server.listen();
    }
    const post = async (
      server: (typeof devServers)[number],
      action: "login" | "refresh" | "logout"
    ) => {
      const address = server.httpServer?.address();
      if (!address || typeof address === "string")
        throw new Error("missing dev server address");
      const url = `http://${host}:${address.port}${apiPath}/${action}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { cookie: jar.getCookieStringSync(url) }
      });
      for (const cookie of response.headers.getSetCookie()) {
        jar.setCookieSync(cookie, url);
      }
      return { status: response.status, session: await response.text() };
    };
    const [first, second] = devServers as [
      (typeof devServers)[number],
      (typeof devServers)[number]
    ];
    // An original, unscoped session cannot be assigned to either origin safely.
    liveSessions.add("legacy");
    jar.setCookieSync(
      `${cookieName}=legacy; Path=${apiPath}`,
      `http://${host}${apiPath}/refresh`
    );
    expect((await post(first, "refresh")).status).toBe(401);
    expect(liveSessions.has("legacy")).toBe(true);
    expect((await post(first, "login")).status).toBe(200);
    expect((await post(second, "login")).status).toBe(200);
    const results = await Promise.all([
      post(first, "refresh"),
      post(second, "refresh")
    ]);
    expect(results).toEqual([
      { status: 200, session: "1" },
      { status: 200, session: "2" }
    ]);
    expect((await post(first, "logout")).status).toBe(200);
    expect((await post(first, "refresh")).status).toBe(401);
    expect((await post(second, "refresh")).status).toBe(200);
  } finally {
    await Promise.all(devServers.map((server) => server.close()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
