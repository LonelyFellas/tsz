import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button } from "@tsz/ui/components/button";
import { AdminTableToolbar } from "@/components/AdminTable";
import { ColumnSettings } from "@/components/ColumnSettings";
import { useColumnSettings } from "@/components/useColumnSettings";
import type { ColumnFixed } from "@/components/column-settings";
import type { AdminWordListItemAny } from "@tsz/types";
import { wordListLabel } from "./presentation";

export interface WordColumn {
  key: string;
  title: string;
  width: number;
  fixed?: ColumnFixed;
  wideOnly?: boolean;
  ellipsis?: boolean;
  render: (row: AdminWordListItemAny) => ReactNode;
}

interface WordListTableProps {
  tableId: string;
  columns: WordColumn[];
  rows: AdminWordListItemAny[];
  loading: boolean;
  toolbar: ReactNode;
  toolbarExtra: ReactNode;
  emptyText: ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, size: number) => void;
  selection?: {
    keys: string[];
    onChange: (keys: string[], selected: AdminWordListItemAny[]) => void;
    disabled: (row: AdminWordListItemAny) => boolean;
  };
}

const CHECKBOX_WIDTH = 44;

export function WordListTable({
  tableId,
  columns,
  rows,
  toolbar,
  toolbarExtra,
  loading,
  emptyText,
  page,
  pageSize,
  total,
  onPageChange,
  selection
}: WordListTableProps) {
  const preferences = useColumnSettings(
    tableId,
    columns.map((column) => ({
      key: column.key,
      label: column.title,
      visible: true,
      fixed: column.fixed ?? false
    }))
  );
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [compact, setCompact] = useState(
    () => !window.matchMedia("(min-width: 576px)").matches
  );
  useLayoutEffect(() => {
    const el = container.current!;
    const measure = () => setWidth(el.clientWidth);
    const media = window.matchMedia("(min-width: 576px)");
    const viewport = () => setCompact(!media.matches);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    media.addEventListener("change", viewport);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", viewport);
    };
  }, []);
  const visible = preferences.columns.flatMap((pref) => {
    const column = columns.find((item) => item.key === pref.key)!;
    if (
      !pref.visible ||
      (compact && !preferences.customized && column.wideOnly)
    )
      return [];
    return [{ ...column, fixed: pref.fixed }];
  });
  const selectionWidth = selection ? CHECKBOX_WIDTH : 0;
  const baseWidth = visible.reduce(
    (sum, col) => sum + col.width,
    selectionWidth
  );
  // 宽屏多余空间给一列，固定列实际宽度与吸附偏移保持一致。
  const fill = visible.find((column) => !column.fixed) ?? visible.at(-1);
  if (fill) fill.width += Math.max(0, width - baseWidth);
  const fixedWidth = visible.reduce(
    (sum, col) => sum + (col.fixed ? col.width : 0),
    selectionWidth
  );
  const overflow = width > 0 && fixedWidth >= width && baseWidth > width;
  let left = selectionWidth;
  let right = visible.reduce(
    (sum, col) => sum + (col.fixed === "right" ? col.width : 0),
    0
  );
  const cells = visible.map((column) => {
    let pin: CSSProperties | undefined;
    if (!overflow && column.fixed === "left") {
      pin = { position: "sticky", left, zIndex: 1 };
      left += column.width;
    } else if (!overflow && column.fixed === "right") {
      right -= column.width;
      pin = { position: "sticky", right, zIndex: 1 };
    }
    return { column, pin };
  });
  const checkboxStyle: CSSProperties | undefined = overflow
    ? undefined
    : { position: "sticky", left: 0, zIndex: 1 };
  const selectable = selection
    ? rows.filter((row) => !selection.disabled(row))
    : [];
  const count = selectable.filter((row) =>
    selection!.keys.includes(row.id)
  ).length;
  const toggle = (changed: AdminWordListItemAny[], checked: boolean) => {
    if (!selection) return;
    const keys = new Set(selection.keys);
    for (const row of changed) {
      if (checked) keys.add(row.id);
      else keys.delete(row.id);
    }
    selection.onChange(
      [...keys],
      rows.filter((row) => keys.has(row.id))
    );
  };

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, lastPage);
  const start = Math.max(1, Math.min(current - 2, lastPage - 4));
  const pages = [
    ...new Set([
      1,
      ...Array.from(
        { length: Math.min(5, lastPage) },
        (_, index) => start + index
      ),
      lastPage
    ])
  ];

  return (
    <>
      <AdminTableToolbar
        extra={toolbarExtra}
        columnSettings={
          <ColumnSettings
            columns={preferences.columns}
            onChange={preferences.update}
            onReset={preferences.reset}
            fixedOverflow={overflow}
          />
        }
      >
        {toolbar}
      </AdminTableToolbar>
      <div className="word-table-scroll" ref={container} aria-busy={loading}>
        <table
          className="word-table"
          style={{ width: Math.max(width, baseWidth) }}
          aria-label={tableId === "dictionary" ? "智能词库" : "垃圾桶"}
        >
          <colgroup>
            {selection && <col style={{ width: selectionWidth }} />}
            {cells.map(({ column }) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {selection && (
                <th scope="col" style={checkboxStyle}>
                  <input
                    type="checkbox"
                    aria-label="选择本页"
                    checked={count > 0 && count === selectable.length}
                    disabled={!selectable.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          count > 0 && count < selectable.length;
                    }}
                    onChange={(event) =>
                      toggle(selectable, event.target.checked)
                    }
                  />
                </th>
              )}
              {cells.map(({ column, pin }) => (
                <th scope="col" key={column.key} style={pin}>
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-selected={selection?.keys.includes(row.id) || undefined}
              >
                {selection && (
                  <td style={checkboxStyle}>
                    <input
                      type="checkbox"
                      aria-label={`选择「${wordListLabel(row)}」`}
                      checked={selection.keys.includes(row.id)}
                      disabled={selection.disabled(row)}
                      onChange={(event) => toggle([row], event.target.checked)}
                    />
                  </td>
                )}
                {cells.map(({ column, pin }) => (
                  <td
                    key={column.key}
                    style={pin}
                    className={
                      column.ellipsis ? "word-cell-ellipsis" : undefined
                    }
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={cells.length + (selection ? 1 : 0)}>
                  {loading ? <span role="status">加载中…</span> : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="word-list-pagination" aria-label="词条分页">
        <span>共 {total} 条</span>
        <button
          type="button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.min(page - 1, lastPage), pageSize)}
        >
          <LeftOutlined />
        </button>
        {pages.map((number, index) => (
          <Fragment key={number}>
            {index > 0 && number - pages[index - 1]! > 1 && (
              <button
                type="button"
                aria-label={index === 1 ? "向前跳五页" : "向后跳五页"}
                onClick={() =>
                  onPageChange(
                    index === 1
                      ? Math.max(1, current - 5)
                      : Math.min(lastPage, current + 5),
                    pageSize
                  )
                }
              >
                …
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="rounded-lg"
              aria-label={`第 ${number} 页`}
              aria-current={number === page ? "page" : undefined}
              onClick={() => onPageChange(number, pageSize)}
            >
              {number}
            </Button>
          </Fragment>
        ))}
        <button
          type="button"
          aria-label="下一页"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1, pageSize)}
        >
          <RightOutlined />
        </button>
        <select
          aria-label="每页条数"
          value={pageSize}
          onChange={(event) => onPageChange(1, Number(event.target.value))}
        >
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      </nav>
    </>
  );
}
