export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * 驱动 WordCreationLayout 的窄屏判定：它靠 ResizeObserver 量 .word-creation-page，
 * 而 jsdom 不做布局、vitest.setup 的全局垫片也从不回调，测试只能自己喂宽度。
 * resize 用来模拟拖动窗口(调用方自行包 act)，restore 在用例收尾换回原实现。
 */
export function mockPageWidthObserver(initialWidth: number) {
  const original = globalThis.ResizeObserver;
  let emit: ((width: number) => void) | undefined;
  globalThis.ResizeObserver = class {
    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      // 只认页面容器：树里若有别的组件也 observe，emit 会被后来者覆盖，
      // resize() 就喂错了对象，用例会以「宽屏没切回来」的样子静默失败。
      if (!target.classList.contains("word-creation-page")) return;
      emit = (width: number) =>
        this.callback(
          [
            {
              target,
              contentRect: { width }
            } as unknown as ResizeObserverEntry
          ],
          this as unknown as ResizeObserver
        );
      emit(initialWidth);
    }

    unobserve() {}

    disconnect() {}
  } as unknown as typeof ResizeObserver;
  return {
    resize: (width: number) => emit?.(width),
    restore: () => {
      globalThis.ResizeObserver = original;
    }
  };
}
