import type { InboundReferenceV3 } from "@tsz/types";
import { createContext, useContext } from "react";
import { EMPTY_REFERENCE_INDEX, type V3ReferenceIndex } from "./referenceGuard";

/**
 * 向导内各层控件共用的引用索引与跳转入口。索引由页面按 `entry_id + revision` 加载；
 * 跳转由渲染步骤的槽位注册（只有它拿得到切步骤、切词性与例句区块的状态）。
 * 缺省值等于「没有引用」，脱离向导单测各组件时行为与从前一致。
 */
export interface V3ReferenceGuard {
  index: V3ReferenceIndex;
  /** 打开一条引用所在位置：同词条例句就地打开，其余在新标签页打开来源。 */
  openReference: (reference: InboundReferenceV3) => void;
  /** 保存被引用拦下后重新拉取引用。 */
  refresh: () => void;
  registerNavigator: (
    navigator: ((reference: InboundReferenceV3) => void) | undefined
  ) => void;
}

const noop = () => undefined;

export const V3ReferenceGuardContext = createContext<V3ReferenceGuard>({
  index: EMPTY_REFERENCE_INDEX,
  openReference: noop,
  refresh: noop,
  registerNavigator: noop
});

export const V3ReferenceGuardProvider = V3ReferenceGuardContext.Provider;

export function useV3ReferenceGuard(): V3ReferenceGuard {
  return useContext(V3ReferenceGuardContext);
}

export function referenceBlockedHint(count: number): string {
  return `被 ${count} 处引用，需先解除引用`;
}
