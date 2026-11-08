import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import {
  forwardRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  TriangleAlert,
  X
} from "lucide-react";
import { useAdminDisabled } from "../context";
import type { Size } from "./layout";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "color"
> {
  type?: "primary" | "default" | "text" | "link" | "dashed";
  htmlType?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  size?: Size;
  color?: string;
  variant?: string;
  danger?: boolean;
  loading?: boolean;
  block?: boolean;
  ghost?: boolean;
  shape?: "circle" | "round" | "default";
  classNames?: { root?: string };
  icon?: ReactNode;
  iconPlacement?: "start" | "end";
  href?: string;
  target?: string;
  rel?: string;
  referrerPolicy?: AnchorHTMLAttributes<HTMLAnchorElement>["referrerPolicy"];
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      type = "default",
      htmlType = "button",
      size = "middle",
      color,
      variant,
      danger,
      loading,
      block,
      ghost,
      icon,
      iconPlacement = "start",
      shape,
      classNames,
      href,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) {
    const inherited = useAdminDisabled();
    const off = loading || (disabled ?? inherited);
    const glyph = loading ? (
      <LoaderCircle aria-hidden="true" className="ui-spinner" />
    ) : (
      icon
    );
    const cls = [
      classNames?.root,
      shape && `ui-btn-${shape}`,
      `ui-btn ui-btn-${type} ui-btn-${size === "small" ? "sm" : size === "large" ? "lg" : "middle"}`,
      variant && `ui-btn-${variant}`,
      (danger || color === "danger") && "ui-btn-dangerous",
      block && "ui-btn-block",
      ghost && "ui-btn-ghost",
      loading && "ui-btn-loading",
      !children && "ui-btn-icon-only",
      className
    ]
      .filter(Boolean)
      .join(" ");
    const content = (
      <>
        {iconPlacement === "start" && glyph && (
          <span className="ui-btn-icon">{glyph}</span>
        )}
        {typeof children === "string" ? <span>{children}</span> : children}
        {iconPlacement === "end" && glyph && (
          <span className="ui-btn-icon">{glyph}</span>
        )}
      </>
    );
    if (href)
      return (
        <a
          {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
          href={off ? undefined : href}
          aria-disabled={off || undefined}
          className={cls}
          onClick={
            off
              ? (e) => e.preventDefault()
              : (props.onClick as AnchorHTMLAttributes<HTMLAnchorElement>["onClick"])
          }
        >
          {content}
        </a>
      );
    return (
      <button
        {...props}
        ref={ref}
        type={htmlType}
        className={cls}
        disabled={off}
        aria-busy={loading || props["aria-busy"]}
      >
        {content}
      </button>
    );
  }
);

type Div = ComponentPropsWithRef<"div">;
export function Spin({
  children,
  size = "middle",
  description,
  className = "",
  ...props
}: Div & { size?: Size; description?: ReactNode }) {
  return (
    <div
      {...props}
      role={props.role ?? "status"}
      className={`ui-spin ui-spin-${size} ${className}`}
    >
      <LoaderCircle aria-hidden="true" className="ui-spinner" />
      {description}
      {children}
    </div>
  );
}
export function Alert({
  title,
  description,
  action,
  showIcon,
  icon,
  type = "info",
  closable,
  onClose,
  className = "",
  ...props
}: Omit<Div, "title" | "onClose"> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  type?: "info" | "warning" | "success" | "error";
  showIcon?: boolean;
  icon?: ReactNode;
  closable?: boolean | { "aria-label"?: string };
  onClose?: () => void;
}) {
  const { t } = useInterfaceTranslation();
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const Icon = {
    info: Info,
    success: CircleCheck,
    warning: TriangleAlert,
    error: CircleAlert
  }[type];
  return (
    <div
      {...props}
      role={props.role ?? "alert"}
      className={`ui-alert ui-alert-${type} ${className}`}
    >
      {showIcon && <span className="ui-alert-icon">{icon ?? <Icon />}</span>}
      <div className="ui-alert-content">
        {title && <div className="ui-alert-title">{title}</div>}
        {description && (
          <div className="ui-alert-description">{description}</div>
        )}
      </div>
      {action && <div className="ui-alert-action">{action}</div>}
      {closable && (
        <button
          type="button"
          className="ui-icon-action"
          aria-label={
            typeof closable === "object"
              ? (closable["aria-label"] ?? t("actions.close"))
              : t("actions.close")
          }
          onClick={() => {
            setClosed(true);
            onClose?.();
          }}
        >
          <X />
        </button>
      )}
    </div>
  );
}
export interface AvatarProps extends ComponentPropsWithRef<"span"> {
  icon?: ReactNode;
  src?: string;
  size?: Size | number;
}
export function Avatar({
  icon,
  src,
  children,
  size = "middle",
  style,
  ...props
}: AvatarProps) {
  const width =
    typeof size === "number"
      ? size
      : { small: 24, middle: 32, large: 40 }[size];
  return (
    <span
      {...props}
      className="ui-avatar"
      style={{ width, height: width, ...style }}
    >
      {src ? <img src={src} alt="" /> : (icon ?? children)}
    </span>
  );
}
export function Tag({
  color,
  variant,
  style,
  className = "",
  ...props
}: ComponentPropsWithRef<"span"> & { color?: string; variant?: string }) {
  const custom = color?.startsWith("#");
  return (
    <span
      {...props}
      data-color={color}
      data-variant={variant}
      className={`ui-tag ui-tag-${color ?? "default"} ${className}`}
      style={{ ...(custom ? { color, borderColor: color } : {}), ...style }}
    />
  );
}
export function Badge({
  count,
  status,
  text,
  children,
  title,
  size,
  ...props
}: Omit<ComponentPropsWithRef<"span">, "title"> & {
  count?: ReactNode;
  status?: string;
  text?: ReactNode;
  title?: string;
  size?: Size;
}) {
  if (!children && !text && !status && !count) return null;
  return (
    <span {...props} className="ui-badge" data-size={size} title={title}>
      {children}
      {status && <i data-status={status} />} {text}
      {count !== undefined && count !== 0 && (
        <sup className="ui-badge-count">{count}</sup>
      )}
    </span>
  );
}
export function Progress({
  percent = 0,
  showInfo = true,
  size,
  className = "",
  ...props
}: Div & {
  percent?: number;
  showInfo?: boolean;
  size?: Size | number | [number | string, number];
}) {
  return (
    <div {...props} className={`ui-progress ${className}`}>
      <progress
        aria-label={props["aria-label"]}
        max={100}
        value={percent}
        style={
          Array.isArray(size)
            ? ({ height: size[1], width: size[0] } as CSSProperties)
            : undefined
        }
      />
      {showInfo && `${percent}%`}
    </div>
  );
}
