import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

interface WordValidationIssueTarget {
  nodeId: string;
  field: string;
}

function isIssueTarget(value: unknown): value is WordValidationIssueTarget {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nodeId === "string" &&
    candidate.nodeId !== "" &&
    typeof candidate.field === "string" &&
    candidate.field !== ""
  );
}

/** 读取预览页通过 location.state 传来的稳定节点定位信息。 */
export function useWordValidationIssue():
  WordValidationIssueTarget | undefined {
  const location = useLocation();
  return useMemo(
    () => (isIssueTarget(location.state) ? location.state : undefined),
    [location.state]
  );
}

function findIssueElement({
  nodeId,
  field
}: WordValidationIssueTarget): HTMLElement | undefined {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("[data-word-node-id]")
  ).filter((element) => element.dataset.wordNodeId === nodeId);
  return (
    candidates.find((element) => element.dataset.wordField === field) ??
    candidates[0]
  );
}

/**
 * 在目标 Tab/折叠内容渲染后滚动并聚焦校验节点。activeScope 变化时会重试，
 * 让先切换词性 Tab、再定位深层字段的流程保持稳定。
 */
export function useWordValidationIssueFocus(activeScope: string): void {
  const location = useLocation();
  const target = isIssueTarget(location.state) ? location.state : undefined;

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    let attempts = 0;
    let retryTimer: number | undefined;
    let clearTimer: number | undefined;

    const locate = () => {
      if (cancelled) return;
      const element = findIssueElement(target);
      if (!element && attempts < 5) {
        attempts += 1;
        retryTimer = window.setTimeout(locate, 40);
        return;
      }
      if (!element) return;

      element.scrollIntoView?.({ behavior: "smooth", block: "center" });
      element.classList.add("word-validation-focus");
      const focusable = element.matches(
        "input, textarea, button, [tabindex]:not([tabindex='-1'])"
      )
        ? element
        : element.querySelector<HTMLElement>(
            "input, textarea, button, [tabindex]:not([tabindex='-1'])"
          );
      focusable?.focus({ preventScroll: true });
      clearTimer = window.setTimeout(
        () => element.classList.remove("word-validation-focus"),
        1800
      );
    };

    retryTimer = window.setTimeout(locate, 0);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (clearTimer !== undefined) window.clearTimeout(clearTimer);
    };
  }, [activeScope, location.key, target]);
}
