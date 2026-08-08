import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

const LEAVE_MESSAGE = "当前步骤有尚未保存的修改，确定离开吗？";

/** 路由跳转、浏览器关闭/刷新共用的未保存修改保护。 */
export function useUnsavedWordChanges(dirty: boolean): () => void {
  const allowNextNavigationRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !allowNextNavigationRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(LEAVE_MESSAGE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = LEAVE_MESSAGE;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return useCallback(() => {
    allowNextNavigationRef.current = true;
    window.setTimeout(() => {
      allowNextNavigationRef.current = false;
    }, 0);
  }, []);
}
