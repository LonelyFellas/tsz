import RcDialog, { type DialogProps } from "@rc-component/dialog";
import {
  createContext,
  useContext,
  useRef,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type ReactNode
} from "react";
import { Button } from "../display";
import "./overlays.css";

export const OverlayLayer = createContext(990);
type ActionButtonProps = ComponentProps<typeof Button>;
type ModalFooter =
  | ReactNode
  | ((
      buttons: ReactNode,
      actions: { OkBtn: ComponentType; CancelBtn: ComponentType }
    ) => ReactNode);
type Mask = boolean | { closable?: boolean };
export interface ModalProps extends Omit<
  DialogProps,
  "visible" | "mask" | "footer" | "onClose"
> {
  open?: boolean;
  onCancel?: DialogProps["onClose"];
  onOk?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  okText?: ReactNode;
  cancelText?: ReactNode;
  okButtonProps?: ActionButtonProps;
  cancelButtonProps?: ActionButtonProps;
  confirmLoading?: boolean;
  centered?: boolean;
  mask?: Mask;
  footer?: ModalFooter;
}

const FooterActions = createContext<{
  ok: ActionButtonProps;
  cancel: ActionButtonProps;
} | null>(null);
function OkBtn() {
  const actions = useContext(FooterActions)!;
  return <Button {...actions.ok} />;
}
function CancelBtn() {
  const actions = useContext(FooterActions)!;
  return <Button {...actions.cancel} />;
}

export function Modal({
  open,
  onCancel,
  onOk,
  okText = "确定",
  cancelText = "取消",
  okButtonProps,
  cancelButtonProps,
  confirmLoading,
  centered,
  mask = true,
  maskClosable,
  closable = true,
  footer,
  children,
  width = 520,
  wrapClassName,
  zIndex,
  ...props
}: ModalProps) {
  const parent = useContext(OverlayLayer);
  const layer = zIndex ?? parent + 10;
  const actions = {
    ok: {
      type: "primary" as const,
      loading: confirmLoading,
      onClick: onOk,
      children: okText,
      ...okButtonProps
    },
    cancel: { onClick: onCancel, children: cancelText, ...cancelButtonProps }
  };
  const buttons = (
    <>
      <CancelBtn />
      <OkBtn />
    </>
  );
  const resolvedFooter =
    typeof footer === "function"
      ? footer(buttons, { OkBtn, CancelBtn })
      : footer === undefined
        ? buttons
        : footer;
  return (
    <OverlayLayer.Provider value={layer}>
      <RcDialog
        {...props}
        prefixCls="ui-modal"
        width={width}
        zIndex={layer}
        visible={open}
        onClose={onCancel}
        mask={!!mask}
        maskClosable={
          maskClosable ??
          (typeof mask === "object" ? mask.closable !== false : true)
        }
        closable={
          closable === false
            ? false
            : {
                "aria-label": "关闭",
                ...(typeof closable === "object" ? closable : {})
              }
        }
        closeIcon={<span aria-hidden="true">×</span>}
        wrapClassName={[wrapClassName, centered && "ui-modal-centered"]
          .filter(Boolean)
          .join(" ")}
        footer={
          resolvedFooter && (
            <FooterActions.Provider value={actions}>
              {resolvedFooter}
            </FooterActions.Provider>
          )
        }
      >
        {children}
      </RcDialog>
    </OverlayLayer.Provider>
  );
}

type DrawerSlot =
  | "root"
  | "body"
  | "header"
  | "footer"
  | "mask"
  | "wrapper"
  | "section"
  | "title"
  | "close"
  | "extra";
interface DrawerProps {
  open?: boolean;
  onClose?: DialogProps["onClose"];
  afterOpenChange?: (open: boolean) => void;
  placement?: "left" | "right" | "bottom" | "top";
  size?: number | string;
  destroyOnHidden?: boolean;
  closable?: DialogProps["closable"];
  mask?: Mask;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  extra?: ReactNode;
  rootClassName?: string;
  className?: string;
  style?: CSSProperties;
  styles?: Partial<Record<DrawerSlot, CSSProperties>>;
  classNames?: Partial<Record<DrawerSlot, string>>;
  "aria-label"?: string;
}
export function Drawer({
  open,
  onClose,
  afterOpenChange,
  placement = "right",
  size = 378,
  destroyOnHidden,
  closable = true,
  mask = true,
  title,
  children,
  footer,
  extra,
  rootClassName,
  className,
  style,
  styles,
  classNames,
  "aria-label": label
}: DrawerProps) {
  const layer = useContext(OverlayLayer) + 10;
  // Drawer 的表单可在关闭时保留挂载，但撤权或清除选择时仍须更新隐藏内容。
  const wasOpen = useRef(false);
  if (open) wasOpen.current = true;
  const extent = size === "large" ? 736 : size === "default" ? 378 : size;
  const horizontal = placement === "right" || placement === "left";
  return (
    <OverlayLayer.Provider value={layer}>
      <RcDialog
        visible={open}
        onClose={onClose}
        afterOpenChange={afterOpenChange}
        prefixCls="ui-drawer"
        zIndex={layer}
        mask={!!mask}
        maskClosable={
          typeof mask === "object" ? mask.closable !== false : !!mask
        }
        scrollLock={!!mask}
        focusTrap={!!mask}
        closable={
          closable === false
            ? false
            : {
                "aria-label": "关闭",
                closeIcon: <span aria-hidden="true">×</span>,
                ...(typeof closable === "object" ? closable : {})
              }
        }
        rootClassName={[
          "ui-drawer-" + placement,
          !mask && "ui-drawer-nonmodal",
          rootClassName,
          classNames?.root
        ]
          .filter(Boolean)
          .join(" ")}
        className={["ui-drawer-content-wrapper", className, classNames?.wrapper]
          .filter(Boolean)
          .join(" ")}
        style={{ ...styles?.wrapper, ...style }}
        width={horizontal ? extent : "100%"}
        height={horizontal ? "100%" : extent}
        forceRender={!destroyOnHidden && wasOpen.current}
        destroyOnHidden={destroyOnHidden}
        rootStyle={styles?.root}
        classNames={{
          ...classNames,
          container: classNames?.section,
          wrapper: undefined
        }}
        styles={{ ...styles, wrapper: undefined, container: styles?.section }}
        title={
          <>
            <span>{title ?? label}</span>
            {extra && (
              <span
                className={"ui-drawer-extra " + (classNames?.extra ?? "")}
                style={styles?.extra}
              >
                {extra}
              </span>
            )}
          </>
        }
        footer={footer}
      >
        {children}
      </RcDialog>
    </OverlayLayer.Provider>
  );
}
