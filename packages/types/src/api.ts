// 通用 API 包裹类型。

import type { SurfaceMatchPageV2, SurfacePolicyNameV2 } from "./surface-match";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

/** OpenAPI 共用审计 actor；系统种子的 id 为 "system"，不能收窄成 UUID。 */
export interface Actor {
  id: string;
  display_name: string;
}

/** RFC 9457 领域错误的通用结构化上下文。 */
export interface ProblemMeta {
  current_revision?: number;
  current_lifecycle_revision?: number;
  word_id?: string;
  max_reachable_step?: "basics" | "forms" | "meanings" | "preview";
  affected_node_ids?: string[];
  usage_count?: number;
  part_of_speech_id?: string;
  code?: string;
  reference_locations?: ProblemReferenceLocation[];
  surface_match_page?: SurfaceMatchPageV2;
  current_policy_name?: SurfacePolicyNameV2;
  current_policy_epoch?: number;
}

export interface ProblemReferenceLocation {
  target_sense_id: string;
  source_entry_id: string;
  source_publication_id: string;
  source_node_id: string;
  reference_kind: string;
}

/** RFC 9457 Problem Details 与 tsz 稳定扩展字段。 */
export interface ProblemDetails {
  /** 跨环境稳定的问题类型 URI。 */
  type: string;
  /** 类型级短标题；客户端不得据此分支。 */
  title: string;
  /** Problem body 中记录的 HTTP 状态；业务控制仍以实际响应状态为准。 */
  status: number;
  /** 本次错误的安全说明。 */
  detail: string;
  /** 稳定机器错误码；客户端业务分支只读取此字段。 */
  code: string;
  /** 单字段错误对应的请求字段。 */
  field?: string;
  /** 领域错误的结构化上下文；客户端不得解析 detail 文案。 */
  meta?: ProblemMeta;
}
