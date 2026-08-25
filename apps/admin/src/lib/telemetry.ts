/** 将非致命前端诊断交给浏览器标准 error channel，供宿主监控统一捕获。 */
export function reportClientError(error: Error): void {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  }
}
