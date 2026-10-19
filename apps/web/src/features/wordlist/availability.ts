import type { WordlistUnavailableReason } from "@tsz/types";

export const unavailableReasonLabels: Record<
  WordlistUnavailableReason,
  string
> = {
  archived: "已移入垃圾桶",
  unpublished: "当前未发布",
  unsupported_schema: "发布版本暂不受支持"
};
