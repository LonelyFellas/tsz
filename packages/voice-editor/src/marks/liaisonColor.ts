import { useSyncExternalStore } from "react";

/** 沿用编辑器原有的连读粉：与核心词的蓝字色区分开。 */
export const DEFAULT_LIAISON_COLOR = "#db2777";

const STORAGE_KEY = "tsz-ve:liaison-color";

/** 只收十六进制色值：它要直接写进 CSS 变量，不能放任意字符串进去。 */
export function isLiaisonColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
  );
}

function readStored(): string {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLiaisonColor(stored) ? stored : DEFAULT_LIAISON_COLOR;
  } catch {
    return DEFAULT_LIAISON_COLOR;
  }
}

/*
 * 连读弧颜色是**显示偏好**而不是内容：wire 上的 liaison 注解没有颜色字段
 * （后端 deny_unknown_fields，塞进去会被整条拒掉），所以存在本机、对整个后台生效，
 * 同一页上的多个编辑器与只读视图靠订阅同步。
 */
let current = readStored();
const listeners = new Set<() => void>();

export function getLiaisonColor(): string {
  return current;
}

export function setLiaisonColor(next: string): void {
  if (!isLiaisonColor(next) || next === current) return;
  current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // 隐私模式等存不进去就只在本次会话内生效。
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLiaisonColor(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiaisonColor(): string {
  return useSyncExternalStore(
    subscribeLiaisonColor,
    getLiaisonColor,
    getLiaisonColor
  );
}
