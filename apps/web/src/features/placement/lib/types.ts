import type { CEFRLevel } from "@tsz/api-client";

// 定级测试 API 契约(wire 形状 snake_case,对齐产品方案 docs/placement-product-plan.md §8.2)。
// 目前后端未实现,由 mock.ts 兑现同一契约;后端(tsz-rust)落地后这些类型
// 迁入 @tsz/api-client,以 openapi snapshot 为权威。

export type Band = CEFRLevel;

/** 档位从低到高;index 即状态机中的档位序号(A1=0 … C2=5)。 */
export const BANDS: readonly Band[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function isBand(x: unknown): x is Band {
  return typeof x === "string" && (BANDS as readonly string[]).includes(x);
}

/** 按状态机档位序号取档(越界钳到 A1/C2)。 */
export function bandAt(index: number): Band {
  return BANDS[Math.min(Math.max(index, 0), BANDS.length - 1)] ?? "A1";
}

/** 单题。响应中永不含真假词标记与档位——防猜的信息边界。 */
export interface BlockItem {
  item_id: string;
  text: string;
}

export interface AssessmentAnswer {
  item_id: string;
  known: boolean;
  /** 题面展示到作答的毫秒数(防猜第二道防线,当前只采集不启用)。 */
  rt_ms: number;
}

export interface StartResponse {
  session_id: string;
  block: BlockItem[];
}

export type AssessmentResult =
  | { state: "completed"; band: Band; vocab_range: string }
  | { state: "invalid"; reason: "too_many_false_alarms" };

export type SubmitResponse =
  { next_block: BlockItem[] } | { result: AssessmentResult };

/** 3 次机会已用尽(mock 本地判定;真后端为 403 quota_exhausted)。 */
export class QuotaExhaustedError extends Error {
  constructor() {
    super("quota_exhausted");
    this.name = "QuotaExhaustedError";
  }
}

/**
 * 组件层唯一依赖的接口。mock 与真实 http 实现互换时组件零改动,
 * 装配点在 client.ts。
 */
export interface AssessmentClient {
  start(): Promise<StartResponse>;
  submit(
    session_id: string,
    answers: AssessmentAnswer[]
  ): Promise<SubmitResponse>;
}
