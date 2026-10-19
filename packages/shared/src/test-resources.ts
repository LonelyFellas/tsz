const KEY = "tsz:test-resource-run";

/** 显式 URL 参数开启独占测试批次；同一标签页导航、刷新后保留，off 退出。 */
export function readTestResourceRun(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const run = new URLSearchParams(window.location.search).get("tsz_test_run");
  if (run !== null) {
    if (run === "off") {
      window.sessionStorage.removeItem(KEY);
      return undefined;
    }
    // 存储失败就中止请求，不能把显式测试请求悄悄写进普通目录。
    window.sessionStorage.setItem(KEY, run);
    return run;
  }
  try {
    return window.sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
