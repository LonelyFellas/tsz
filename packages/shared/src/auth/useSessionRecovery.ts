import { useCallback, useEffect, useState } from "react";

export function useSessionRecovery(
  restore: () => Promise<void>,
  getState: () => { connectionError: boolean },
  initialize: () => Promise<void> = restore
) {
  const [retrying, setRetrying] = useState(false);
  const runRestore = useCallback(async (operation: () => Promise<void>) => {
    setRetrying(true);
    try {
      await operation();
    } catch {
      // runtime 已将恢复错误写入 store，界面保留错误提示与重试入口。
    } finally {
      setRetrying(false);
    }
  }, []);
  const retry = useCallback(() => runRestore(restore), [runRestore, restore]);

  useEffect(() => {
    void runRestore(initialize);
    const online = () => {
      if (getState().connectionError) void retry();
    };
    window.addEventListener("online", online);
    const recovered = () => void retry();
    window.addEventListener("tsz:session-recovered", recovered);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("tsz:session-recovered", recovered);
    };
  }, [initialize, runRestore, retry, getState]);

  return { retry, retrying };
}
