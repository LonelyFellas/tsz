import RcPagination from "@rc-component/pagination";
import type { PaginationProps as RcPaginationProps } from "@rc-component/pagination";
import zhCN from "@rc-component/pagination/es/locale/zh_CN";
import "./table.css";

export interface PaginationProps extends RcPaginationProps {
  size?: "small" | "middle" | "default";
}

export function Pagination({
  size,
  className,
  itemRender,
  ...props
}: PaginationProps) {
  return (
    <RcPagination
      {...props}
      className={[size === "small" && "ui-pagination-small", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="分页"
      itemRender={(page, type, original) => {
        const button =
          type === "page" ? (
            <button
              aria-label={`第 ${page} 页`}
              aria-current={page === props.current ? "page" : undefined}
              type="button"
              tabIndex={-1}
              disabled={props.disabled}
            >
              {page}
            </button>
          ) : (
            original
          );
        return itemRender ? itemRender(page, type, button) : button;
      }}
      locale={zhCN}
      prefixCls="ui-pagination"
      prevIcon={
        <button type="button" aria-label="上一页">
          ‹
        </button>
      }
      nextIcon={
        <button type="button" aria-label="下一页">
          ›
        </button>
      }
      jumpPrevIcon={<span aria-hidden="true">…</span>}
      jumpNextIcon={<span aria-hidden="true">…</span>}
      sizeChangerRender={({
        size: value,
        options,
        disabled,
        onSizeChange,
        className: selectClass
      }) => (
        <select
          aria-label="每页条数"
          className={selectClass}
          disabled={disabled}
          value={value}
          onChange={(event) => onSizeChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    />
  );
}
