import { ChevronDown, X } from "lucide-react";
import RcSelect, {
  type SelectProps as RcSelectProps,
  type DefaultOptionType,
  type BaseOptionType
} from "@rc-component/select";
import RcCascader from "@rc-component/cascader";
import type { PanelProps } from "@rc-component/cascader/es/Panel";
import type { DefaultOptionType as CascadeOption } from "@rc-component/cascader/es/Cascader";
import {
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";
import { useFieldDisabled } from "./Form";
import { useInterfaceTranslation } from "@tsz/shared/i18n/react";

type MenuParts<T> = Partial<
  Record<
    | "content"
    | "input"
    | "placeholder"
    | "suffix"
    | "prefix"
    | "item"
    | "itemContent"
    | "itemRemove"
    | "clear",
    T
  >
> & { popup?: { root?: T }; root?: T };
export type SelectProps<
  V = unknown,
  O extends BaseOptionType = DefaultOptionType
> = Omit<RcSelectProps<V, O>, "classNames" | "styles"> & {
  size?: "small" | "middle" | "large";
  status?: "error" | "warning" | "";
  variant?: "borderless" | "filled" | "outlined" | "underlined";
  onOpenChange?: (open: boolean) => void;
  classNames?: MenuParts<string>;
  styles?: MenuParts<CSSProperties>;
};
export function Select<
  V = unknown,
  O extends BaseOptionType = DefaultOptionType
>({
  classNames,
  styles,
  size,
  status,
  variant,
  className,
  style,
  onOpenChange,
  disabled,
  suffixIcon,
  allowClear,
  ...props
}: SelectProps<V, O>) {
  const { t } = useInterfaceTranslation();
  const prefix = "ui-select";
  const { root: rootStyle, popup: popupStyles, ...parts } = styles ?? {};
  const { root: rootClass, popup: popupClasses, ...classes } = classNames ?? {};
  return (
    <RcSelect<V, O>
      {...props}
      prefixCls={prefix}
      className={[
        className,
        rootClass,
        variant && `${prefix}-${variant}`,
        status && `${prefix}-status-${status}`,
        size &&
          `${prefix}-${size === "small" ? "sm" : size === "large" ? "lg" : "md"}`
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...rootStyle, ...style }}
      styles={parts}
      classNames={classes}
      disabled={useFieldDisabled(disabled)}
      suffixIcon={
        suffixIcon === undefined ? (
          <ChevronDown size="1em" aria-hidden="true" />
        ) : (
          suffixIcon
        )
      }
      allowClear={
        allowClear === true
          ? { clearIcon: <X size="1em" aria-hidden="true" /> }
          : allowClear
      }
      removeIcon={<X size="1em" aria-label={t("actions.remove")} />}
      notFoundContent={
        props.notFoundContent === undefined
          ? t("status.noData")
          : props.notFoundContent
      }
      onPopupVisibleChange={onOpenChange}
      popupClassName={popupClasses?.root}
      popupStyle={popupStyles?.root}
      getPopupContainer={
        props.getPopupContainer ??
        ((anchor: HTMLElement) =>
          anchor.closest<HTMLElement>('[role="dialog"]') ?? document.body)
      }
    />
  );
}
export function AutoComplete<O extends BaseOptionType = DefaultOptionType>({
  children,
  ...props
}: SelectProps<string, O> & { children?: ReactNode }) {
  const input = isValidElement(children)
    ? (children as ReactElement)
    : undefined;
  return (
    <Select<string, O>
      {...props}
      mode="combobox"
      suffixIcon={null}
      getInputElement={input ? () => input : undefined}
    />
  );
}
function Panel<O extends CascadeOption = CascadeOption>({
  disabled,
  ...props
}: PanelProps<O>) {
  const { t } = useInterfaceTranslation();
  return (
    <RcCascader.Panel<O>
      {...props}
      prefixCls="ui-cascader"
      disabled={useFieldDisabled(disabled)}
      expandIcon={<span aria-hidden="true">›</span>}
      loadingIcon={<span aria-label={t("status.loading")}>…</span>}
    />
  );
}
export const Cascader = { Panel };
