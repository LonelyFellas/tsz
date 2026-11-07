import Trigger, {
  type ActionType,
  type AlignType,
  type TriggerRef,
  type BuildInPlacements
} from "@rc-component/trigger";
import RcMenu, {
  type MenuProps as HeadlessMenuProps
} from "@rc-component/menu";
import {
  cloneElement,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type Key,
  type ReactElement,
  type ReactNode
} from "react";
import { OverlayLayer } from "./dialog";
import { useAdminDisabled } from "../context";
import { Button } from "../display";
import type { ComponentProps } from "react";

type Side =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";
const placements: BuildInPlacements = {};
for (const [name, points, offset] of [
  ["top", ["bc", "tc"], [0, -6]],
  ["bottom", ["tc", "bc"], [0, 6]],
  ["left", ["cr", "cl"], [-6, 0]],
  ["right", ["cl", "cr"], [6, 0]],
  ["topLeft", ["bl", "tl"], [0, -6]],
  ["topRight", ["br", "tr"], [0, -6]],
  ["bottomLeft", ["tl", "bl"], [0, 6]],
  ["bottomRight", ["tr", "br"], [0, 6]]
] as const)
  placements[name] = {
    points: [...points],
    offset: [...offset],
    overflow: { adjustX: true, adjustY: true, shiftX: 8, shiftY: 8 }
  };

// A menu or interactive popup inside a modal must stay inside its focus boundary.
const nearestDialog = (target: HTMLElement) =>
  target.closest<HTMLElement>('[role="dialog"]') ?? target.ownerDocument.body;

type Slot = "root" | "container" | "title" | "content" | "body";
interface FloatingProps {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ActionType | ActionType[];
  placement?: Side;
  align?: AlignType;
  arrow?: boolean;
  disabled?: boolean;
  fresh?: boolean;
  destroyOnHidden?: boolean;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
  overlayStyle?: CSSProperties;
  zIndex?: number;
  styles?: Partial<Record<Slot, CSSProperties>>;
  classNames?: Partial<Record<Slot, string>>;
}
interface SurfaceProps extends FloatingProps {
  kind: "tooltip" | "popover" | "popconfirm" | "dropdown";
  popup: ReactNode;
}
function Surface({
  kind,
  popup,
  children,
  open,
  onOpenChange,
  trigger = "hover",
  placement = "top",
  align,
  disabled,
  fresh,
  destroyOnHidden,
  getPopupContainer,
  overlayStyle,
  zIndex,
  styles,
  classNames
}: SurfaceProps) {
  const parent = useContext(OverlayLayer);
  const [internal, setInternal] = useState(false);
  const active = !disabled && (open ?? internal);
  const id = useId();
  useEffect(() => {
    if (disabled) setInternal(false);
  }, [disabled]);
  const setOpen = (value: boolean) => {
    if (open === undefined) setInternal(value);
    onOpenChange?.(value);
  };
  const triggerRef = useRef<TriggerRef>(null);
  const keyboardMenu = useRef(false);
  const closeRef = useRef(setOpen);
  closeRef.current = setOpen;
  useEffect(() => {
    if (!active) return;
    const close = (event: KeyboardEvent) => {
      const triggerElement = triggerRef.current?.nativeElement;
      const popupElement = triggerRef.current?.popupElement;
      if (
        event.key !== "Escape" ||
        !(event.target instanceof Node) ||
        !(
          triggerElement?.contains(event.target) ||
          popupElement?.contains(event.target)
        )
      )
        return;
      // 由最内层浮层消费 Escape，避免关闭其所属对话框。
      if (
        event.target instanceof Element &&
        popupElement?.contains(event.target) &&
        event.target.closest("[data-admin-floating]")?.id !== id
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current(false);
      if (kind === "dropdown") triggerElement?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [active, id, kind]);
  const focusMenu = () => {
    const first = triggerRef.current?.popupElement?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])'
    );
    first?.focus();
  };
  const prefix = kind === "popconfirm" ? "ui-popover" : "ui-" + kind;
  const node = isValidElement(children) ? (
    (children as ReactElement<React.HTMLAttributes<HTMLElement>>)
  ) : (
    <span>{children}</span>
  );
  const anchor = cloneElement(
    node,
    kind === "tooltip"
      ? { "aria-describedby": active ? id : node.props["aria-describedby"] }
      : {
          "aria-expanded": active,
          "aria-controls": active ? id : undefined,
          ...(kind === "dropdown"
            ? {
                "aria-haspopup": "menu" as const,
                onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
                  node.props.onKeyDown?.(event);
                  if (
                    disabled ||
                    event.defaultPrevented ||
                    !["ArrowDown", "Enter", " "].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  if (active) focusMenu();
                  else {
                    keyboardMenu.current = true;
                    setOpen(true);
                  }
                }
              }
            : {})
        }
  );
  return (
    <Trigger
      ref={triggerRef}
      afterOpenChange={(visible) => {
        if (visible && keyboardMenu.current) focusMenu();
        keyboardMenu.current = false;
      }}
      prefixCls={prefix}
      action={disabled ? [] : trigger}
      disabled={disabled}
      popupVisible={active}
      onOpenChange={setOpen}
      popupPlacement={placement}
      builtinPlacements={placements}
      popupAlign={align}
      autoDestroy={destroyOnHidden ?? kind !== "popover"}
      fresh={fresh ?? kind !== "popover"}
      getPopupContainer={getPopupContainer ?? nearestDialog}
      zIndex={zIndex ?? parent + 65}
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0.1}
      popupStyle={{ ...overlayStyle, ...styles?.root }}
      popupClassName={[
        classNames?.root,
        kind === "popconfirm" ? "ui-popconfirm" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      popup={
        <div
          id={id}
          data-admin-floating=""
          hidden={!active}
          role={
            kind === "tooltip"
              ? "tooltip"
              : kind === "popconfirm"
                ? "alertdialog"
                : kind === "popover"
                  ? "group"
                  : undefined
          }
          aria-label={kind === "popconfirm" ? "确认操作" : undefined}
          className={prefix + "-container " + (classNames?.container ?? "")}
          style={styles?.container}
        >
          {popup}
        </div>
      }
    >
      {anchor}
    </Trigger>
  );
}

export function Tooltip({
  title,
  children,
  ...props
}: FloatingProps & { title?: ReactNode }) {
  const noTitle = title === undefined || title === null || title === "";
  return (
    <Surface
      {...props}
      disabled={props.disabled || noTitle}
      kind="tooltip"
      popup={title}
    >
      {children}
    </Surface>
  );
}

export function Popover({
  title,
  content,
  children,
  ...props
}: FloatingProps & {
  title?: ReactNode;
  content?: ReactNode | (() => ReactNode);
}) {
  return (
    <Surface
      {...props}
      kind="popover"
      popup={
        <>
          {title && (
            <div
              className={"ui-popover-title " + (props.classNames?.title ?? "")}
              style={props.styles?.title}
            >
              {title}
            </div>
          )}
          <div
            className={
              "ui-popover-inner-content " + (props.classNames?.content ?? "")
            }
            style={props.styles?.content}
          >
            {typeof content === "function" ? content() : content}
          </div>
        </>
      }
    >
      {children}
    </Surface>
  );
}

interface PopconfirmProps extends FloatingProps {
  title: ReactNode;
  description?: ReactNode;
  okText?: ReactNode;
  cancelText?: ReactNode;
  onConfirm?: (event: React.MouseEvent<HTMLButtonElement>) => unknown;
  onCancel?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  cancelButtonProps?: ComponentProps<typeof Button>;
  okButtonProps?: ComponentProps<typeof Button>;
}
export function Popconfirm({
  title,
  description,
  okText = "确定",
  cancelText = "取消",
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  okButtonProps,
  cancelButtonProps,
  children,
  ...props
}: PopconfirmProps) {
  const inheritedDisabled = useAdminDisabled();
  const disabled = props.disabled ?? inheritedDisabled;
  const [internal, setInternal] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const setOpen = (next: boolean) => {
    if (lock.current) return;
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };
  const confirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (lock.current || disabled) return;
    const result = onConfirm?.(event);
    if (result && typeof result === "object" && "then" in result) {
      lock.current = true;
      setPending(true);
      Promise.resolve(result).then(
        () => {
          lock.current = false;
          setPending(false);
          setOpen(false);
        },
        () => {
          lock.current = false;
          setPending(false);
        }
      );
    } else setOpen(false);
  };
  return (
    <Surface
      {...props}
      disabled={disabled}
      open={open ?? internal}
      onOpenChange={setOpen}
      trigger="click"
      kind="popconfirm"
      popup={
        <>
          <div className="ui-popover-title">{title}</div>
          {description && (
            <div className="ui-popover-inner-content">{description}</div>
          )}
          <div className="ui-popconfirm-buttons">
            <Button
              size="small"
              disabled={pending}
              {...cancelButtonProps}
              onClick={(e) => {
                onCancel?.(e);
                setOpen(false);
              }}
            >
              {cancelText}
            </Button>
            <Button
              size="small"
              type="primary"
              {...okButtonProps}
              loading={pending || okButtonProps?.loading}
              onClick={confirm}
            >
              {okText}
            </Button>
          </div>
        </>
      }
    >
      {children}
    </Surface>
  );
}

type MenuClick = NonNullable<HeadlessMenuProps["onClick"]>;
interface MenuEntry {
  key: Key;
  label?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  children?: (MenuEntry | null)[];
  type?: "group" | "item" | "submenu" | "divider";
  onClick?: MenuClick;
}
export interface MenuProps extends Omit<HeadlessMenuProps, "items"> {
  items?: (MenuEntry | { type: "divider"; key?: Key } | null)[];
}
function menuItems(items: MenuProps["items"]): HeadlessMenuProps["items"] {
  return items?.map((item) => {
    if (!item) return null;
    if (item.type === "divider") return { type: "divider", key: item.key };
    const label = (
      <>
        {item.icon && (
          <span aria-hidden="true" className="ui-menu-icon">
            {item.icon}
          </span>
        )}
        <span className="ui-menu-title-content">{item.label}</span>
      </>
    );
    const common = {
      key: item.key,
      label,
      disabled: item.disabled,
      onClick: item.onClick,
      className: item.danger ? "ui-menu-danger" : undefined
    };
    if (item.type === "group")
      return { ...common, type: "group", children: menuItems(item.children) };
    if (item.children)
      return {
        ...common,
        key: String(item.key),
        children: menuItems(item.children) ?? []
      };
    return common;
  });
}
export function Menu({ items, prefixCls = "ui-menu", ...props }: MenuProps) {
  return <RcMenu {...props} prefixCls={prefixCls} items={menuItems(items)} />;
}
export function Dropdown({
  menu,
  open,
  onOpenChange,
  children,
  ...props
}: FloatingProps & { menu: MenuProps }) {
  const inheritedDisabled = useAdminDisabled();
  const disabled = props.disabled ?? inheritedDisabled;
  const [internal, setInternal] = useState(false);
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };
  return (
    <Surface
      {...props}
      disabled={disabled}
      kind="dropdown"
      placement={props.placement ?? "bottomLeft"}
      open={open ?? internal}
      onOpenChange={setOpen}
      popup={
        <Menu
          prefixCls="ui-dropdown-menu"
          selectable={false}
          {...menu}
          onClick={(e) => {
            menu.onClick?.(e);
            setOpen(false);
          }}
        />
      }
    >
      {children}
    </Surface>
  );
}

export function FloatButton({
  tooltip,
  shape = "circle",
  icon,
  content,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "content"> & {
  tooltip?: { title?: ReactNode };
  shape?: "circle" | "square";
  icon?: ReactNode;
  content?: ReactNode;
}) {
  return (
    <Tooltip title={tooltip?.title}>
      <button
        type="button"
        {...props}
        className={["ui-float-btn", "ui-float-btn-" + shape, className]
          .filter(Boolean)
          .join(" ")}
      >
        {icon}
        {content}
      </button>
    </Tooltip>
  );
}
