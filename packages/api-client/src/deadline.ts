/** Local transport failure, never a fabricated HTTP status. */
export class RequestTimeoutError extends Error {
  constructor(public readonly method: string) {
    super(
      ["GET", "HEAD"].includes(method)
        ? "请求超时，请重试"
        : "请求超时，操作结果尚未确认，请先刷新查看结果"
    );
    this.name = "RequestTimeoutError";
  }
}

/** Covers headers, body and shared-refresh waits, even if a dependency ignores abort. */
export function createRequestDeadline(
  milliseconds: number,
  method: string,
  caller?: AbortSignal | null
) {
  const controller = new AbortController();
  const cancel = () => controller.abort(caller?.reason);
  if (caller?.aborted) cancel();
  else caller?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new RequestTimeoutError(method)),
    milliseconds
  );
  return {
    signal: controller.signal,
    async wait<T>(operation: () => Promise<T>): Promise<T> {
      controller.signal.throwIfAborted();
      let rejectAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", rejectAbort, {
          once: true
        });
      });
      try {
        return await Promise.race([operation(), aborted]);
      } finally {
        controller.signal.removeEventListener("abort", rejectAbort);
      }
    },
    dispose() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", cancel);
    }
  };
}
