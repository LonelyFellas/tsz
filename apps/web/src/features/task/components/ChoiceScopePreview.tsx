"use client";

import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";
import type { ChoicePlanPreview } from "@tsz/types";

const reasons: Record<
  ChoicePlanPreview["unavailable_items"][number]["reason"],
  string
> = {
  target_ineligible: "当前等级或档位下没有适用的词义和词形",
  evidence_incomplete: "词义资料不完整，暂不能可靠生成选项",
  target_unaligned: "暂无法可靠对应当前词义",
  insufficient_distractors: "暂时找不到三个可靠的干扰项",
  custom_source_unsupported: "自定义词暂不支持单选，可另建拼写任务"
};

export function ChoiceScopePreview({
  preview,
  eligibleCount
}: {
  preview: ChoicePlanPreview;
  eligibleCount: number;
}) {
  const uiText = useWebText(webTask);
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">
        {uiText("{{v0}} 个目标词义 ·{{v1}} 个可出单选 · {{v2}} 个暂不可用", {
          v0: preview.total_count,
          v1: eligibleCount,
          v2: preview.unavailable_count
        })}
      </p>
      {preview.unavailable_count > 0 && (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {uiText("查看暂不可用内容与原因")}
          </summary>
          <ChoiceUnavailableItems preview={preview} />
        </details>
      )}
    </div>
  );
}

export function ChoiceUnavailableItems({
  preview
}: {
  preview: ChoicePlanPreview;
}) {
  const uiText = useWebText(webTask);
  return (
    <>
      <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2 text-sm">
        {preview.unavailable_items.map((item) => (
          <li key={item.unit_key} className="break-words">
            <p className="font-medium">
              {item.spelling} · {item.definition}
            </p>
            <p className="text-foreground-muted">
              {uiText(reasons[item.reason])}
            </p>
          </li>
        ))}
      </ul>
      {preview.unavailable_truncated && (
        <p className="mt-3 text-xs text-foreground-muted">
          {uiText("当前列出前 {{v0}} 项，共 {{v1}} 项暂不可用。", {
            v0: preview.unavailable_items.length,
            v1: preview.unavailable_count
          })}
        </p>
      )}
    </>
  );
}
