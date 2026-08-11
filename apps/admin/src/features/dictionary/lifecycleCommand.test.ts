import { describe, expect, it, vi } from "vitest";
import { runLifecycleCommandOnce } from "./lifecycleCommand";

describe("runLifecycleCommandOnce", () => {
  it("双击期间只执行一次，完成后允许下一条独立命令", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const command = vi.fn(() => pending);
    const lock = { current: false };

    const first = runLifecycleCommandOnce(lock, command);
    const second = runLifecycleCommandOnce(lock, command);

    expect(command).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeUndefined();

    release();
    await first;
    await runLifecycleCommandOnce(lock, command);
    expect(command).toHaveBeenCalledTimes(2);
  });

  it("请求失败也会释放锁", async () => {
    const lock = { current: false };
    await expect(
      runLifecycleCommandOnce(lock, () => Promise.reject(new Error("409")))
    ).rejects.toThrow("409");
    expect(lock.current).toBe(false);
  });
});
