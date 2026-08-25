// 命名基线:本包类型 1:1 镜像后端(Go)JSON 的 wire 格式 —— 字段一律 snake_case,
// 不在前端做 snake↔camel 转换层(http.ts 纯 JSON.parse)。接新接口时逐字段对 Swagger 校对。
// 仅前端内部、不经网络的形状(组件 props、本地 state)不受此约束,沿用 camelCase。

export * from "./user";
export * from "./word";
export * from "./task";
export * from "./api";
export * from "./auth";
export * from "./admin";
export * from "./admin-user";
export * from "./admin-role";
export * from "./part-of-speech";
export * from "./rich-text";
export * from "./admin-tts";
export * from "./admin-word-v2";
export * from "./admin-word-v3";
export * from "./surface-match";
export type {
  AdminWordKind,
  AdminWordListItem,
  CefrLevel,
  AdminWordListPage,
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordV2ListItem,
  AdminWordV2ListResponse,
  AdminWordStats,
  AdminWordStatus,
  Dialect,
  HeadwordVariant,
  RelatedSearchResponse,
  RelatedSearchQuery,
  RelatedSearchMatchMode,
  RelatedSearchLegacyResponse,
  RelatedSearchV2Response,
  RelatedWordResult,
  RelatedWordSense,
  SourceDialect,
  WordFormType,
  WordPosTag,
  WordRelationType,
  WordSubPos,
  PronunciationStyle
} from "./admin-word";
