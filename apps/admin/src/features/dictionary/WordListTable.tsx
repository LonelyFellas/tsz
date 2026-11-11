import { useLexiconListTranslation } from "@/features/dictionary/i18n/list";
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@tsz/ui/components/button";
import { Select } from "@tsz/ui/admin/forms";
import { AdminTableToolbar } from "@/components/AdminTable";
import { ColumnSettings } from "@/components/ColumnSettings";
import { useColumnSettings } from "@/components/useColumnSettings";
import type { ColumnFixed } from "@/components/column-settings";
import type { AdminWordListItemAny } from "@tsz/types";

export interface WordColumn<Row = AdminWordListItemAny> {
  key: string;
  title: string;
  width: number;
  fixed?: ColumnFixed;
  wideOnly?: boolean;
  defaultVisible?: boolean;
  ellipsis?: boolean;
  render: (row: Row) => ReactNode;
}

interface WordListTableProps<Row extends { id: string }> {
  tableId: string;
  ariaLabel?: string;
  columns: WordColumn<Row>[];
  rows: Row[];
  rowLabel: (row: Row) => string;
  loading: boolean;
  toolbar: ReactNode;
  emptyText: ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, size: number) => void;
  selection?: {
    keys: string[];
    onChange: (keys: string[], selected: Row[]) => void;
    disabled: (row: Row) => boolean;
  };
}

const CHECKBOX_WIDTH = 44;

export function WordListTable<Row extends { id: string }>({
  tableId,
  ariaLabel,
  columns,
  rows,
  rowLabel,
  toolbar,
  loading,
  emptyText,
  page,
  pageSize,
  total,
  onPageChange,
  selection
}: WordListTableProps<Row>) {
  const { t, i18n } = useLexiconListTranslation();
  const preferences = useColumnSettings(
    tableId,
    columns.map((column) => ({
      key: column.key,
      label: column.title,
      visible: column.defaultVisible ?? true,
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
  // 小屏优先让操作按钮完整落在首屏，保留自定义列的横向滚动。
  if (compact && width > 0) {
    const label = visible.find((column) => column.key === "label");
    const actions = visible.find((column) => column.key === "action");
    if (label && actions) {
      if (!i18n.language.startsWith("en"))
        actions.width = tableId === "dictionary-trash" ? 168 : 132;
      const middleColumns = visible.some(
        (column) => column.key !== "label" && column.key !== "action"
      );
      label.width = Math.max(
        84,
        width - selectionWidth - actions.width - (middleColumns ? 80 : 0)
      );
      // 细屏保留操作入口；空间不足时让名称参与横向滚动，避免左右固定列相互覆盖。
      if (
        middleColumns &&
        width - selectionWidth - actions.width - label.width < 48
      )
        label.fixed = false;
    }
  }
  const baseWidth = visible.reduce(
    (sum, col) => sum + col.width,
    selectionWidth
  );
  // 宽屏多余空间给一列，固定列实际宽度与吸附偏移保持一致。
  const fill =
    visible.find((column) => column.key === "gloss") ??
    visible.find((column) => !column.fixed) ??
    visible.at(-1);
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
  const toggle = (changed: Row[], checked: boolean) => {
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
        columnSettings={
          <ColumnSettings
            columns={preferences.columns}
            onChange={preferences.update}
            onReset={preferences.reset}
            fixedOverflow={overflow}
          />
        }
      >
        <div className="word-list-result-summary">
          <span>
            {loading ? (
              t("loading")
            ) : (
              <>
                {t("total_prefix")}{" "}
                <strong>{total.toLocaleString(i18n.language)}</strong>{" "}
                {t("entry_count_unit", { count: total })}
              </>
            )}
          </span>
          {selection && selection.keys.length > 0 && (
            <span className="word-list-selected-count" role="status">
              {t("selected_count", { count: selection.keys.length })}
              <button type="button" onClick={() => selection.onChange([], [])}>
                {t("clear_selection")}
              </button>
            </span>
          )}
        </div>
        {toolbar}
      </AdminTableToolbar>
      <div className="word-table-scroll" ref={container} aria-busy={loading}>
        <table
          className="word-table"
          style={{ width: Math.max(width, baseWidth) }}
          aria-label={
            ariaLabel ??
            (tableId === "dictionary" ? t("entries") : t("status_archived"))
          }
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
                    aria-label={t("select_page")}
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
                <th
                  scope="col"
                  key={column.key}
                  data-column-key={column.key}
                  style={pin}
                >
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
                      aria-label={t("select_entry", {
                        label: rowLabel(row)
                      })}
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
                  {loading ? (
                    <span role="status">{t("loading_short")}</span>
                  ) : (
                    emptyText
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="word-list-pagination" aria-label={t("pagination")}>
        <span>
          {t("total_items", { count: total })}
          <span className="word-pagination-range">
            {t("page_range", {
              start: total === 0 ? 0 : (current - 1) * pageSize + 1,
              end: Math.min(current * pageSize, total)
            })}
          </span>
        </span>
        <button
          type="button"
          aria-label={t("previous")}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.min(page - 1, lastPage), pageSize)}
        >
          <ChevronLeftIcon />
        </button>
        {pages.map((number, index) => (
          <Fragment key={number}>
            {index > 0 && number - pages[index - 1]! > 1 && (
              <button
                type="button"
                aria-label={index === 1 ? t("jump_back") : t("jump_forward")}
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
              aria-label={t("page", { page: number })}
              aria-current={number === page ? "page" : undefined}
              onClick={() => onPageChange(number, pageSize)}
            >
              {number}
            </Button>
          </Fragment>
        ))}
        <button
          type="button"
          aria-label={t("next")}
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1, pageSize)}
        >
          <ChevronRightIcon />
        </button>
        <Select
          aria-label={t("per_page")}
          value={pageSize}
          onChange={(size) => onPageChange(1, size)}
          showSearch={false}
          popupMatchSelectWidth={false}
          options={[10, 20, 50, 100].map((size) => ({
            value: size,
            label: t("page_size", { size })
          }))}
        />
      </nav>
    </>
  );
}
