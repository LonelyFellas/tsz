"use client";

import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useUserStore } from "@/stores/user";

const subscribeHydration = () => () => {};

export function useWebLocaleReady() {
  const settled = useUserStore(
    (state) =>
      state.hydrated || state.connectionError || state.refreshUnconfirmed
  );
  const owner = useUserStore(() => interfacePreferences.sessionKey());
  const snapshot = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getServerSnapshot
  );
  return settled && snapshot.owner === owner && snapshot.status !== "idle";
}

export function WebLocaleBoundary({ children }: { children: ReactNode }) {
  const ready = useWebLocaleReady();
  const accountId = useUserStore((state) => state.user?.id ?? "guest");
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-locale-pending", !ready);
    if (ready) return;
    // Portal 不在 React 容器内；同时保留入口资源失败时的独立重试通道。
    const previous = new Map<HTMLElement, boolean>();
    const isolate = () => {
      for (const node of document.body.children) {
        if (
          !(node instanceof HTMLElement) ||
          node.matches(
            "#web-interface, #web-locale-boot, [data-resource-recovery], script, style, link"
          ) ||
          previous.has(node)
        )
          continue;
        previous.set(node, node.inert === true);
        node.inert = true;
      }
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      previous.forEach((inert, node) => {
        node.inert = inert;
      });
    };
  }, [ready]);
  return (
    <>
      <div
        id="web-locale-boot"
        className="fixed inset-0 hidden place-items-center"
        aria-hidden
      >
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" />
      </div>
      <div
        id="web-interface"
        key={accountId}
        aria-hidden={hydrated && !ready}
        inert={hydrated && !ready}
      >
        {children}
      </div>
    </>
  );
}
