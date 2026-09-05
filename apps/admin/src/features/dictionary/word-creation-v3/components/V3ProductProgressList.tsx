import { CheckCircleFilled } from "@ant-design/icons";
import { Flex, Typography } from "antd";
import type { ReactNode } from "react";

export interface V3ProductProgressListRow {
  key: string;
  index: number;
  label: string;
  completed: boolean;
  value: ReactNode;
}

/**
 * 左栏「完成情况」列表：完成打勾、未完成显示序号圆圈，右侧计数不带底色。
 * step1 与向导内各步共用本组件——两边各自渲染时样式会跟着 `v3-product-progress-list`
 * 挂没挂而分叉（右侧计数有无灰底就是这么来的）。
 */
export function V3ProductProgressList({
  currentKey,
  disabled = false,
  onSelect,
  rows
}: {
  currentKey?: string;
  disabled?: boolean;
  onSelect: (key: string) => void;
  rows: readonly V3ProductProgressListRow[];
}) {
  return (
    <Flex
      className="word-creation-progress-list v3-product-progress-list"
      gap={12}
      vertical
    >
      {rows.map((row) => (
        <button
          aria-current={row.key === currentKey ? "step" : undefined}
          className="word-creation-progress-row"
          data-readiness-state={row.completed ? "complete" : "incomplete"}
          disabled={disabled}
          key={row.key}
          onClick={() => onSelect(row.key)}
          type="button"
        >
          {row.completed ? (
            <CheckCircleFilled
              aria-label={`${row.label}已完成`}
              className="word-progress-done"
            />
          ) : (
            <span aria-hidden="true" className="word-progress-index">
              {row.index}
            </span>
          )}
          <span className="word-progress-label">{row.label}</span>
          <Typography.Text type="secondary">{row.value}</Typography.Text>
        </button>
      ))}
    </Flex>
  );
}
