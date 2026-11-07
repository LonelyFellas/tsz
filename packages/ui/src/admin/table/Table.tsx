import RcTable, {
  type ColumnType as RcColumnType,
  type Reference,
  type TableProps as RcTableProps
} from "@rc-component/table";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type Key,
  type ReactNode,
  type Ref
} from "react";
import { Pagination, type PaginationProps } from "./Pagination";

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

interface Column<T> extends RcColumnType<T> {
  responsive?: Breakpoint[];
  sorter?: (left: T, right: T) => number;
}
export type TableColumnsType<T> = Column<T>[];
export type TableRef = Reference;

interface RowSelection<T> {
  selectedRowKeys?: Key[];
  preserveSelectedRowKeys?: boolean;
  fixed?: boolean;
  getCheckboxProps?: (row: T) => InputHTMLAttributes<HTMLInputElement>;
  getTitleCheckboxProps?: () => InputHTMLAttributes<HTMLInputElement>;
  onChange?: (keys: Key[], rows: T[], info: { type: "all" | "single" }) => void;
}

export interface TableProps<T extends object> extends Omit<
  RcTableProps<T>,
  "columns" | "data"
> {
  ref?: Ref<TableRef>;
  columns?: TableColumnsType<T>;
  dataSource?: readonly T[];
  pagination?: false | PaginationProps;
  rowSelection?: RowSelection<T>;
  loading?: boolean;
  locale?: { emptyText?: ReactNode };
  size?: "small" | "middle" | "large";
  bordered?: boolean;
}

const breakpoints: Record<Breakpoint, string> = {
  xs: "(max-width: 575px)",
  sm: "(min-width: 576px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 992px)",
  xl: "(min-width: 1200px)",
  xxl: "(min-width: 1600px)"
};
const noRows: never[] = [];

export function Table<T extends object>({
  ref,
  dataSource = noRows,
  columns = [],
  rowKey = "key",
  pagination,
  rowSelection,
  loading,
  locale,
  size = "large",
  bordered,
  expandable,
  className,
  ...props
}: TableProps<T>) {
  const [pageState, setPage] = useState(1);
  const [sizeState, setPageSize] = useState(10);
  const [sort, setSort] = useState<{ key: Key; descending: boolean }>();
  const [selectionState, setSelection] = useState<Key[]>([]);
  const selectedKeys = rowSelection?.selectedRowKeys ?? selectionState;
  const records = useRef(new Map<Key, T>());
  const config = pagination || {};
  const total = config.total ?? dataSource.length;
  const pageSize = config.pageSize ?? sizeState;
  const current = Math.min(
    config.current ?? pageState,
    Math.max(1, Math.ceil(total / pageSize))
  );
  const keyOf = (row: T): Key =>
    typeof rowKey === "function"
      ? rowKey(row)
      : (row[rowKey as keyof T] as Key);

  const observed = columns
    .flatMap((column) => column.responsive ?? [])
    .sort()
    .join(",");
  const media = useMemo(
    () =>
      Array.from(new Set(observed.split(",").filter(Boolean))).map((name) => ({
        name,
        query: window.matchMedia(breakpoints[name as Breakpoint])
      })),
    [observed]
  );
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender((count) => count + 1);
    for (const { query } of media) query.addEventListener("change", update);
    return () => {
      for (const { query } of media)
        query.removeEventListener("change", update);
    };
  }, [media]);

  const activeSort = columns.find(
    (column, index) =>
      (column.key ?? String(column.dataIndex ?? index)) === sort?.key
  )?.sorter;
  const sorted =
    activeSort && sort
      ? [...dataSource].sort(
          (a, b) => (sort.descending ? -1 : 1) * activeSort(a, b)
        )
      : dataSource;
  // A server-paginated response already contains just the requested page.
  const pageRows =
    pagination !== false && total <= sorted.length
      ? sorted.slice((current - 1) * pageSize, current * pageSize)
      : sorted;
  const viewColumns = columns.flatMap((column, index): RcColumnType<T>[] => {
    if (
      column.responsive &&
      !media.some(
        ({ name, query }) =>
          query.matches && column.responsive!.includes(name as Breakpoint)
      )
    )
      return [];
    if (!column.sorter) return [column];
    const key = column.key ?? String(column.dataIndex ?? index);
    return [
      {
        ...column,
        title: (
          <button
            className="ui-table-sort"
            type="button"
            onClick={() => {
              setSort((previous) =>
                previous?.key !== key
                  ? { key, descending: false }
                  : previous.descending
                    ? undefined
                    : { key, descending: true }
              );
            }}
          >
            {column.title}
            <span aria-hidden="true" className="ui-table-sort-mark" />
          </button>
        ),
        onHeaderCell: (c) => ({
          ...column.onHeaderCell?.(c),
          "aria-sort":
            sort?.key !== key
              ? "none"
              : sort.descending
                ? "descending"
                : "ascending"
        })
      }
    ];
  });

  if (rowSelection) {
    const selectable = pageRows.filter(
      (row) => !rowSelection.getCheckboxProps?.(row).disabled
    );
    const checkedCount = selectable.filter((row) =>
      selectedKeys.includes(keyOf(row))
    ).length;
    const toggle = (
      rows: readonly T[],
      checked: boolean,
      type: "all" | "single"
    ) => {
      const nextKeys = new Set(selectedKeys);
      for (const row of rows) {
        const key = keyOf(row);
        if (checked) nextKeys.add(key);
        else nextKeys.delete(key);
      }
      const byKey = new Map(
        rowSelection.preserveSelectedRowKeys ? records.current : []
      );
      for (const row of dataSource) byKey.set(keyOf(row), row);
      const kept = new Map(
        Array.from(nextKeys).flatMap((key) =>
          byKey.has(key) ? [[key, byKey.get(key)!] as const] : []
        )
      );
      const next = rowSelection.preserveSelectedRowKeys
        ? [...nextKeys]
        : [...kept.keys()];
      records.current = kept;
      setSelection(next);
      rowSelection.onChange?.(next, [...kept.values()], { type });
    };
    const titleProps = rowSelection.getTitleCheckboxProps?.();
    viewColumns.unshift({
      key: "row-selection",
      width: 40,
      align: "center",
      fixed:
        rowSelection.fixed ??
        Boolean(
          viewColumns[0]?.fixed === "left" || viewColumns[0]?.fixed === "start"
        ),
      title: (
        <input
          aria-label="选择本页"
          {...titleProps}
          type="checkbox"
          checked={checkedCount > 0 && checkedCount === selectable.length}
          ref={(node) => {
            if (node)
              node.indeterminate =
                checkedCount > 0 && checkedCount < selectable.length;
          }}
          disabled={titleProps?.disabled || !selectable.length}
          onChange={(e) => toggle(selectable, e.target.checked, "all")}
        />
      ),
      render: (_, row) => (
        <input
          aria-label={`选择 ${keyOf(row)}`}
          {...rowSelection.getCheckboxProps?.(row)}
          type="checkbox"
          checked={selectedKeys.includes(keyOf(row))}
          onChange={(e) => toggle([row], e.target.checked, "single")}
        />
      )
    });
  }
  return (
    <div
      className={["ui-table-wrapper", className].filter(Boolean).join(" ")}
      aria-busy={!!loading}
    >
      <RcTable<T>
        {...props}
        ref={ref}
        prefixCls="ui-table"
        className={`ui-table-${size}${bordered ? " ui-table-bordered" : ""}`}
        rowKey={rowKey}
        data={pageRows}
        columns={viewColumns}
        emptyText={locale?.emptyText ?? "暂无数据"}
        expandable={
          expandable && {
            ...expandable,
            expandIcon:
              expandable.expandIcon ??
              (({ expanded, expandable: canExpand, onExpand, record }) =>
                canExpand ? (
                  <button
                    type="button"
                    className="ui-table-row-expand-icon"
                    aria-label={expanded ? "收起行" : "展开行"}
                    aria-expanded={expanded}
                    onClick={(e) => {
                      onExpand(record, e);
                      e.stopPropagation();
                    }}
                  >
                    {expanded ? "−" : "+"}
                  </button>
                ) : null)
          }
        }
      />
      {loading && (
        <div className="ui-table-loading" role="status">
          加载中…
        </div>
      )}
      {pagination !== false && total > 0 && (
        <Pagination
          {...config}
          className="ui-table-pagination"
          size={size === "small" ? "small" : "default"}
          current={current}
          pageSize={pageSize}
          total={total}
          onChange={(page, nextSize) => {
            setPage(page);
            setPageSize(nextSize);
            config.onChange?.(page, nextSize);
          }}
        />
      )}
    </div>
  );
}
