import { useCallback, useEffect, useState } from "react";

export function useSessionRecovery(restore: () => Promise<void>) {
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await restore();
    } catch {
      // runtime 已将恢复错误写入 store，界面保留错误提示与重试入口。
    } finally {
      setRetrying(false);
    }
  }, [restore]);

  useEffect(() => {
    void retry();
    const online = () => {
      void retry();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [retry]);

  return { retry, retrying };
}
