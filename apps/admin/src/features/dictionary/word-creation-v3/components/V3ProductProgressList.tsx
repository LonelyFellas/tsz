import {
  CaretDownOutlined,
  CaretUpOutlined,
  CheckCircleFilled
} from "@ant-design/icons";
import { Flex, Typography } from "antd";
import { useState, type ReactNode } from "react";
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
 * 左栏「完成情况」列表：完成打勾、未完成显示序号圆圈，右侧计数不带底色。
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <Flex
      className="word-creation-progress-list v3-product-progress-list"
      gap={12}
      vertical
    >
      {rows.map((row) => (
        <section
          aria-label={`${row.label}摘要`}
          className="v3-product-progress-group"
          key={row.key}
        >
          <button
            aria-current={row.key === currentKey ? "step" : undefined}
            aria-expanded={Boolean(expanded[row.key])}
            aria-label={`${expanded[row.key] ? "收起" : "展开"}${row.label}`}
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
            {/* 计数与折叠指示同占一个网格项：进度行是三列 grid，多一项会被挤到次行 */}
            <span className="v3-product-progress-trailing">
              <Typography.Text type="secondary">{row.value}</Typography.Text>
              {expanded[row.key] ? (
                <CaretUpOutlined aria-hidden="true" />
              ) : (
                <CaretDownOutlined aria-hidden="true" />
              )}
            </span>
          </button>
          {row.details && expanded[row.key] && (
            <ul className="v3-product-progress-details">
              {row.details.length === 0 ? (
                <li className="v3-product-progress-empty">暂未添加</li>
              ) : (
                row.details.map((detail) => (
                  <li key={detail.key}>
                    <div className="v3-product-progress-detail">
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
                        <span>{detail.count}</span>
                      )}
                    </div>
                    {detail.items && detail.items.length > 0 && (
                      <ul className="v3-product-progress-items">
                        {detail.items.map((item) => (
                          <li
                            key={item.key}
                            className="v3-product-progress-text"
                            title={item.label}
                          >
                            {item.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      ))}
    </Flex>
  );
}
