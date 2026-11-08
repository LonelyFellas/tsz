import { useWorkspaceTranslation } from "@/features/dictionary/i18n/workspace";
import { CheckIcon } from "lucide-react";
import { Flex, Typography } from "@tsz/ui/admin/display";
import { useId, useState, type ReactNode } from "react";
import type { V3ProductProgressDetail } from "../readiness";

export interface V3ProductProgressListRow {
  key: string;
  index: number;
  label: string;
  completed: boolean;
  value: ReactNode;
  details?: readonly V3ProductProgressDetail[];
  statusDescription?: string;
}

/**
 * 左栏「完成情况」列表：完成打勾、未完成显示序号，右侧计数不带底色。
 * step1 与向导内各步共用本组件——两边各自渲染时样式会跟着 `v3-product-progress-list`
 * 挂没挂而分叉（右侧计数有无灰底就是这么来的）。
 *
 * 点行只展开/收起该行的明细，默认全部收起；这里不做跳转，纯粹是一份可查看的清单。
 */
export function V3ProductProgressList({
  currentKey,
  rows
}: {
  currentKey?: string;
  rows: readonly V3ProductProgressListRow[];
}) {
  const { t } = useWorkspaceTranslation();
  const detailsId = useId();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <Flex
      className="word-creation-progress-list v3-product-progress-list"
      gap={2}
      vertical
    >
      {rows.map((row) => (
        <section
          aria-label={t("progress_summary", { label: row.label })}
          className="v3-product-progress-group"
          data-progress-key={row.key}
          key={row.key}
        >
          <button
            aria-current={row.key === currentKey ? "step" : undefined}
            aria-expanded={Boolean(expanded[row.key])}
            aria-controls={row.details ? `${detailsId}-${row.key}` : undefined}
            aria-label={t(
              expanded[row.key] ? "progress_collapse" : "progress_expand",
              { label: row.label }
            )}
            className="word-creation-progress-row"
            data-readiness-state={row.completed ? "complete" : "incomplete"}
            onClick={() =>
              setExpanded((current) => ({
                ...current,
                [row.key]: !current[row.key]
              }))
            }
            title={row.statusDescription}
            type="button"
          >
            {row.completed ? (
              <CheckIcon
                aria-label={t("progress_complete", { label: row.label })}
                className="word-progress-done"
              />
            ) : (
              <span aria-hidden="true" className="word-progress-index">
                {row.index}
              </span>
            )}
            <span className="word-progress-label">{row.label}</span>
            {/* 计数与折叠指示同占一个网格项：进度行是三列 grid，多一项会被挤到次行 */}
            <span className="v3-product-progress-trailing">
              {!(row.completed && row.value === "完成") && (
                <Typography.Text type="secondary">
                  {typeof row.value === "number"
                    ? t("item_count", { count: row.value })
                    : row.value === "完成"
                      ? t("progress_done")
                      : row.value === "未完成"
                        ? t("progress_pending")
                        : row.value}
                </Typography.Text>
              )}
              <span
                aria-hidden="true"
                className="v3-product-progress-chevron"
              />
            </span>
          </button>
          {row.details && (
            <div
              id={`${detailsId}-${row.key}`}
              className="v3-product-progress-panel"
              data-expanded={Boolean(expanded[row.key])}
              aria-hidden={!expanded[row.key]}
              inert={!expanded[row.key]}
            >
              <div className="v3-product-progress-panel-inner">
                {row.key in expanded && (
                  <ul className="v3-product-progress-details">
                    {row.details.length === 0 ? (
                      <li className="v3-product-progress-empty">
                        {t("not_added")}
                      </li>
                    ) : (
                      row.details.map((detail, index) => (
                        <li key={detail.key} data-pending={detail.pending}>
                          <div className="v3-product-progress-detail">
                            {row.key === "sense_groups" && (
                              <span className="v3-product-progress-ordinal">
                                {index + 1}.
                              </span>
                            )}
                            {detail.dialect && (
                              <span
                                className={`dialect-dot dialect-dot-${detail.dialect}`}
                              />
                            )}
                            <span
                              className="v3-product-progress-text"
                              title={detail.label}
                            >
                              {detail.label}
                            </span>
                            {detail.count !== undefined && (
                              <span>
                                {t("item_count", { count: detail.count })}
                              </span>
                            )}
                          </div>
                          {detail.items && detail.items.length > 0 && (
                            <ol className="v3-product-progress-items">
                              {detail.items.map((item) => (
                                <li key={item.key} data-pending={item.pending}>
                                  <span
                                    className="v3-product-progress-text"
                                    title={item.label}
                                  >
                                    {item.label}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      ))}
    </Flex>
  );
}
