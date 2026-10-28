import { Table, type TableProps, type TableRef } from "antd";
import {
  Children,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { ColumnSettings } from "./ColumnSettings";
import { useColumnSettings } from "./useColumnSettings";
import "./AdminTable.css";

function titleText(title: ReactNode): string {
  return Children.toArray(title)
    .map((child): string => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? titleText(child.props.children)
        : "";
    })
    .join("");
}

export type AdminTableProps<T extends object> = TableProps<T> & {
  tableId: string;
  toolbar?: ReactNode;
  toolbarExtra?: ReactNode;
};

export function AdminTableToolbar({
  children,
  extra,
  columnSettings
}: {
  children?: ReactNode;
  extra?: ReactNode;
  columnSettings?: ReactNode;
}) {
  if (!children && !extra && !columnSettings) return null;
  return (
    <div className="admin-table-toolbar" role="group" aria-label="表格操作">
      {children && (
        <div className="admin-table-toolbar-primary">{children}</div>
      )}
      <div className="admin-table-toolbar-trailing">
        {extra && <div className="admin-table-toolbar-extra">{extra}</div>}
        {columnSettings && (
          <div className="admin-table-toolbar-settings">{columnSettings}</div>
        )}
      </div>
    </div>
  );
}

export function AdminTable<T extends object>(props: AdminTableProps<T>) {
  return <ConfiguredTable key={props.tableId} {...props} />;
}

function ConfiguredTable<T extends object>({
  tableId,
  columns = [],
  scroll,
  className,
  toolbar,
  toolbarExtra,
  ...props
}: AdminTableProps<T>) {
  const definitions = columns.map((column, index) => {
    const label =
      (typeof column.title !== "function" && titleText(column.title)) ||
      `第 ${index + 1} 列`;
    const dataIndex = "dataIndex" in column ? column.dataIndex : undefined;
    return {
      key: String(
        column.key ??
          (Array.isArray(dataIndex) ? dataIndex.join(".") : dataIndex) ??
          label
      ),
      label,
      visible: !column.hidden,
      fixed:
        column.fixed === true ||
        column.fixed === "left" ||
        column.fixed === "start"
          ? ("left" as const)
          : column.fixed === "right" || column.fixed === "end"
            ? ("right" as const)
            : (false as const),
      column
    };
  });
  const settings = useColumnSettings(tableId, definitions);
  const hasFixed = settings.columns.some(
    (column) => column.visible && column.fixed
  );
  const tableRef = useRef<TableRef>(null);
  const [fixedOverflow, setFixedOverflow] = useState(false);
  const layoutKey = settings.columns
    .map(({ key, visible, fixed }) => `${key}:${visible}:${fixed}`)
    .join("|");
  useLayoutEffect(() => {
    const root = tableRef.current?.nativeElement;
    const header = root?.querySelector(".ant-table-thead > tr");
    if (!root || !header) return;
    const measure = () => {
      const fixedWidth = [...header.children]
        .filter((cell) => cell.classList.contains("ant-table-cell-fix"))
        .reduce((width, cell) => width + cell.getBoundingClientRect().width, 0);
      setFixedOverflow(root.clientWidth > 0 && fixedWidth > root.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(header);
    return () => observer.disconnect();
  }, [columns, layoutKey]);
  const columnSettings = (
    <ColumnSettings
      columns={settings.columns}
      onChange={settings.update}
      onReset={settings.reset}
      fixedOverflow={fixedOverflow}
      buttonSize={props.size === "small" ? "small" : "middle"}
    />
  );
  return (
    <>
      <AdminTableToolbar extra={toolbarExtra} columnSettings={columnSettings}>
        {toolbar}
      </AdminTableToolbar>
      <Table<T>
        {...props}
        ref={tableRef}
        className={[
          className,
          settings.customized && "admin-table-custom-columns",
          fixedOverflow && "admin-table-pins-overflow"
        ]
          .filter(Boolean)
          .join(" ")}
        scroll={hasFixed ? { x: "max-content", ...scroll } : scroll}
        columns={settings.columns
          .filter((column) => column.visible)
          .map((setting) => {
            const column = definitions.find(
              (item) => item.key === setting.key
            )!.column;
            return {
              ...column,
              key: setting.key,
              hidden: false,
              responsive: settings.customized ? undefined : column.responsive,
              fixed: setting.fixed,
              width: setting.fixed ? (column.width ?? 160) : column.width
            };
          })}
      />
    </>
  );
}
