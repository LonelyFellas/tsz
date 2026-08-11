export interface LifecycleCommandLock {
  current: boolean;
}

/**
 * Ant Design 的 confirm 在第一次异步 onOk 完成前仍可能收到第二次触发。
 * 该锁保证一次用户命令只生成一个幂等键、只发出一个写请求。
 */
export async function runLifecycleCommandOnce<T>(
  lock: LifecycleCommandLock,
  command: () => Promise<T>
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await command();
  } finally {
    lock.current = false;
  }
}
