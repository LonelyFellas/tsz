import {
  Children,
  isValidElement,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode
} from "react";
import { FileSearch } from "lucide-react";
import { Spin } from "./controls";
import type { Size } from "./layout";

type Div = ComponentPropsWithRef<"div">;
export function Card({
  title,
  extra,
  size = "middle",
  styles,
  loading,
  children,
  className = "",
  ...props
}: Omit<Div, "title"> & {
  title?: ReactNode;
  extra?: ReactNode;
  size?: Size;
  styles?: { body?: CSSProperties; header?: CSSProperties };
  loading?: boolean;
}) {
  return (
    <div {...props} className={`ui-card ui-card-${size} ${className}`}>
      {(title || extra) && (
        <div className="ui-card-head" style={styles?.header}>
          <div className="ui-card-head-wrapper">
            <div className="ui-card-head-title">{title}</div>
            {extra && <div className="ui-card-extra">{extra}</div>}
          </div>
        </div>
      )}
      <div className="ui-card-body" style={styles?.body}>
        {loading ? <Skeleton active /> : children}
      </div>
    </div>
  );
}
export function Empty({
  image,
  description = "暂无数据",
  children,
  className = "",
  ...props
}: Div & { image?: ReactNode; description?: ReactNode }) {
  return (
    <div {...props} className={`ui-empty ${className}`}>
      {image && <div className="ui-empty-image">{image}</div>}
      <div className="ui-empty-description">{description}</div>
      {children}
    </div>
  );
}
Empty.PRESENTED_IMAGE_SIMPLE = <FileSearch aria-hidden="true" />;
export function Skeleton({
  paragraph,
  title = true,
  active
}: {
  paragraph?: boolean | { rows?: number };
  title?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className="ui-skeleton"
      role="status"
      aria-label="加载中"
      data-active={active}
    >
      {title && <i />}
      {paragraph !== false &&
        Array.from(
          { length: typeof paragraph === "object" ? (paragraph.rows ?? 3) : 3 },
          (_, i) => <i key={i} />
        )}
    </div>
  );
}
export function Result({
  status,
  title,
  subTitle,
  extra
}: {
  status?: string | number;
  title?: ReactNode;
  subTitle?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="ui-result" data-status={status}>
      {title && <div className="ui-result-title">{title}</div>}
      {subTitle && <div className="ui-result-subtitle">{subTitle}</div>}
      {extra && <div className="ui-result-extra">{extra}</div>}
    </div>
  );
}
export function Breadcrumb({
  items,
  className = "",
  "aria-label": label = "面包屑"
}: {
  items: { title?: ReactNode; href?: string }[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <nav aria-label={label} className={`ui-breadcrumb ${className}`}>
      <ol>
        {items.map(({ title, href }, i) => (
          <li key={i}>
            {i > 0 && <span aria-hidden="true"> / </span>}
            {href ? <a href={href}>{title}</a> : title}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Divider({ style }: { style?: CSSProperties }) {
  return <hr className="ui-divider" style={style} />;
}
export function Statistic({
  title,
  value,
  suffix,
  styles
}: {
  title?: ReactNode;
  value?: string | number;
  suffix?: ReactNode;
  styles?: { content?: CSSProperties };
}) {
  return (
    <div className="ui-statistic">
      <div className="ui-statistic-title">{title}</div>
      <div className="ui-statistic-content" style={styles?.content}>
        <span className="ui-statistic-content-value">
          {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
        </span>
        {suffix && (
          <span className="ui-statistic-content-suffix">{suffix}</span>
        )}
      </div>
    </div>
  );
}
interface DescriptionItem {
  key?: React.Key;
  label?: ReactNode;
  children?: ReactNode;
  span?: number | string;
}
function Item({ children }: DescriptionItem) {
  return <>{children}</>;
}
export function Descriptions({
  items,
  children,
  column = 3,
  size,
  bordered,
  layout,
  className = ""
}: {
  items?: DescriptionItem[];
  children?: ReactNode;
  column?: number | Record<string, number>;
  size?: Size;
  bordered?: boolean;
  layout?: string;
  className?: string;
}) {
  const entries =
    items ??
    Children.toArray(children).flatMap((c) =>
      isValidElement<DescriptionItem>(c)
        ? [{ ...c.props, key: c.key ?? undefined }]
        : []
    );
  const cols = typeof column === "number" ? column : (column.xs ?? 1);
  return (
    <dl
      className={`ui-descriptions ${className}`}
      data-bordered={bordered}
      data-size={size}
      data-layout={layout}
      style={
        {
          "--ui-columns": cols,
          "--ui-columns-sm": typeof column === "object" ? column.sm : undefined,
          "--ui-columns-md": typeof column === "object" ? column.md : undefined
        } as CSSProperties
      }
    >
      {entries.map((item, i) => (
        <div
          key={item.key ?? i}
          className="ui-descriptions-item"
          style={{
            gridColumn: item.span
              ? `span ${Math.min(typeof item.span === "number" ? item.span : cols, cols)}`
              : undefined
          }}
        >
          <dt className="ui-descriptions-item-label">{item.label}</dt>
          <dd className="ui-descriptions-item-content">{item.children}</dd>
        </div>
      ))}
    </dl>
  );
}
Descriptions.Item = Item;
export function List<T>({
  dataSource = [],
  renderItem,
  size,
  loading
}: {
  dataSource?: T[];
  renderItem: (item: T, index: number) => ReactNode;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <div className="ui-list" data-size={size}>
      {loading ? (
        <Spin />
      ) : dataSource.length ? (
        <ul className="ui-list-items">
          {Children.toArray(dataSource.map(renderItem))}
        </ul>
      ) : (
        <Empty />
      )}
    </div>
  );
}
List.Item = function ListItem({
  children,
  actions
}: {
  children?: ReactNode;
  actions?: ReactNode[];
}) {
  return (
    <li className="ui-list-item">
      {children}
      {actions?.length ? (
        <div className="ui-list-item-action">{actions}</div>
      ) : null}
    </li>
  );
};
