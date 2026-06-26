import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshTokens, scheduleRefresh, setAccessToken } from "./request";

// ── fetch mock ────────────────────────────────────────────────────────────────

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // 每个用例前重置模块状态
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function refreshOk(accessToken = "new-at", expiresIn = 900) {
  return fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ access_token: accessToken, expires_in: expiresIn })
  } as unknown as Response);
}

function refreshFail() {
  return fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ error: "invalid refresh token" })
  } as unknown as Response);
}

// ── scheduleRefresh ───────────────────────────────────────────────────────────

describe("scheduleRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("在 (expiresIn - 30)s 后触发 refreshTokens", async () => {
    setAccessToken("tok");
    refreshOk("tok2", 900);

    scheduleRefresh(900); // 应在 870s 后触发
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(870_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expiresIn ≤ 30 时不排期定时器（防止无限刷新循环）", async () => {
    setAccessToken("tok");
    scheduleRefresh(20);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("重复调用只保留最新的定时器", async () => {
    setAccessToken("tok");
    refreshOk("tok2", 900);

    scheduleRefresh(9999); // 第一个 — 9969s 后
    scheduleRefresh(900); // 覆盖为 870s

    await vi.advanceTimersByTimeAsync(870_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 只触发一次
  });

  it("定时器触发刷新失败时调 redirectToLogin 跳转登录页", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        set href(v: string) {
          assignMock(v);
        }
      }
    });

    setAccessToken("tok");
    refreshFail();

    scheduleRefresh(900);
    await vi.advanceTimersByTimeAsync(870_000);
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("setAccessToken(null) 取消定时器", async () => {
    setAccessToken("tok");
    scheduleRefresh(900);

    setAccessToken(null); // 登出 → 清定时器
    await vi.advanceTimersByTimeAsync(870_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("刷新成功后自动用新 expires_in 重新排期", async () => {
    setAccessToken("tok");
    // 第一次刷新成功，返回新的 expires_in = 900
    refreshOk("tok2", 900);
    // 第二次也成功
    refreshOk("tok3", 900);

    scheduleRefresh(900);
    await vi.advanceTimersByTimeAsync(870_000); // 第一次触发
    await vi.advanceTimersByTimeAsync(870_000); // 第二次定时器触发
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── refreshTokens 竞态保护 ────────────────────────────────────────────────────

describe("refreshTokens — 竞态保护", () => {
  it("并发调用只发一次 fetch，所有调用者拿到同一个 access token", async () => {
    setAccessToken("old");
    refreshOk("new-at");

    // 三个并发调用
    const [r1, r2, r3] = await Promise.all([
      refreshTokens(),
      refreshTokens(),
      refreshTokens()
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toBe("new-at");
    expect(r2).toBe("new-at");
    expect(r3).toBe("new-at");
  });

  it("第一次刷新结束后，下一次调用能重新发请求", async () => {
    setAccessToken("tok");
    refreshOk("at1");
    await refreshTokens();

    refreshOk("at2");
    const result = await refreshTokens();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBe("at2");
  });

  it("刷新失败时 Promise reject，refreshingPromise 清空供下次重试", async () => {
    setAccessToken("tok");
    refreshFail();

    await expect(refreshTokens()).rejects.toThrow("refresh failed");

    // 下次可以重新发请求
    refreshOk("at-retry");
    const result = await refreshTokens();
    expect(result).toBe("at-retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── setAccessToken ────────────────────────────────────────────────────────────

describe("setAccessToken", () => {
  it("写入 token 后再清除，定时器不再触发", async () => {
    vi.useFakeTimers();
    setAccessToken("tok");
    scheduleRefresh(900);

    setAccessToken(null);
    await vi.advanceTimersByTimeAsync(870_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
