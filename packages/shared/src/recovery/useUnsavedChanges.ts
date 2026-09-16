"use client";

import { useEffect } from "react";

export function useUnsavedChanges(id: string, active: boolean) {
  useEffect(() => {
    const notify = (dirty: boolean) =>
      window.dispatchEvent(
        new CustomEvent("tsz:edit-state", { detail: { id, dirty } })
      );
    notify(active);
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (active) window.addEventListener("beforeunload", prevent);
    return () => {
      notify(false);
      window.removeEventListener("beforeunload", prevent);
    };
  }, [id, active]);
}
