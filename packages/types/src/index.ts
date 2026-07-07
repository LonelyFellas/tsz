// 命名基线:本包类型 1:1 镜像后端(Go)JSON 的 wire 格式 —— 字段一律 snake_case,
// 不在前端做 snake↔camel 转换层(http.ts 纯 JSON.parse)。接新接口时逐字段对 Swagger 校对。
// 仅前端内部、不经网络的形状(组件 props、本地 state)不受此约束,沿用 camelCase。

export * from "./user";
export * from "./word";
export * from "./task";
export * from "./api";
export * from "./admin";
export * from "./admin-user";
export * from "./admin-role";
export type {
  AdminWordKind,
  AdminWordListItem,
  CefrLevel,
  AdminWord,
  AdminWordBatchDeleteResponse,
  AdminWordCreateInput,
  AdminWordEnvelope,
  AdminWordIncompleteError,
  AdminWordListPage,
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordSaveInput,
  AdminWordStats,
  AdminWordStatus,
  Dialect,
  DialectMode,
  GrammarStructure,
  GrammarVariant,
  RelatedSearchResponse,
  RelatedWordResult,
  RelatedWordSense,
  RichText,
  RichTextSpan,
  SenseGroup,
  WordDefinition,
  WordForm,
  WordFormType,
  WordPos,
  WordPosTag,
  WordPronunciation,
  WordRelation,
  WordRelationType,
  WordSense,
  WordSentence,
  WordSubPos,
  PronunciationStyle
} from "./admin-word";
