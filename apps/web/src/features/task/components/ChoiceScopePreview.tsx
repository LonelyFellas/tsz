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
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">
        {preview.total_count} 个目标词义 · {eligibleCount} 个可出单选 ·{" "}
        {preview.unavailable_count} 个暂不可用
      </p>
      {preview.unavailable_count > 0 && (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            查看暂不可用内容与原因
          </summary>
          <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2 text-sm">
            {preview.unavailable_items.map((item) => (
              <li key={item.unit_key} className="break-words">
                <p className="font-medium">
                  {item.spelling} · {item.definition}
                </p>
                <p className="text-foreground-muted">{reasons[item.reason]}</p>
              </li>
            ))}
          </ul>
          {preview.unavailable_truncated && (
            <p className="mt-3 text-xs text-foreground-muted">
              当前列出前 {preview.unavailable_items.length} 项，共{" "}
              {preview.unavailable_count} 项暂不可用。
            </p>
          )}
        </details>
      )}
    </div>
  );
}
