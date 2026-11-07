import RcInput, {
  TextArea as RcTextArea,
  type InputProps as RcInputProps,
  type TextAreaProps,
  type InputRef
} from "@rc-component/input";
import RcNumber, {
  type InputNumberProps as RcNumberProps,
  type ValueType
} from "@rc-component/input-number";
import { forwardRef, useRef, useState, type ReactNode } from "react";
import { useFieldDisabled } from "./Form";
export type { TextAreaRef } from "@rc-component/input";

type Size = "small" | "middle" | "large";
type InputStyle = {
  size?: Size;
  status?: "error" | "warning" | "";
  variant?: "outlined" | "borderless" | "filled" | "underlined";
};
type InputProps = RcInputProps & InputStyle;
function fieldClass(
  prefix: string,
  { size, variant, status }: InputStyle,
  className = ""
) {
  return [
    className,
    size &&
      `${prefix}-${size === "small" ? "sm" : size === "large" ? "lg" : "md"}`,
    variant && `${prefix}-${variant}`,
    status && `${prefix}-status-${status}`
  ]
    .filter(Boolean)
    .join(" ");
}
function clearControl(clear: RcInputProps["allowClear"]) {
  return clear === true
    ? { clearIcon: <span aria-label="清除">×</span> }
    : clear;
}
const TextInput = forwardRef<InputRef, InputProps>(function TextInput(
  { disabled, size, status, variant, className, allowClear, ...props },
  ref
) {
  return (
    <RcInput
      {...props}
      ref={ref}
      prefixCls="ui-input"
      className={fieldClass("ui-input", { size, status, variant }, className)}
      disabled={useFieldDisabled(disabled)}
      allowClear={clearControl(allowClear)}
    />
  );
});
const TextArea = forwardRef<
  import("@rc-component/input").TextAreaRef,
  TextAreaProps & Pick<InputStyle, "status">
>(function TextArea(
  { disabled, status, className, allowClear, ...props },
  ref
) {
  return (
    <RcTextArea
      {...props}
      ref={ref}
      prefixCls="ui-input"
      className={fieldClass("ui-input", { status }, className)}
      classNames={{ textarea: "ui-input ui-input-textarea" }}
      disabled={useFieldDisabled(disabled)}
      allowClear={clearControl(allowClear)}
    />
  );
});
function Password(props: InputProps) {
  const [visible, setVisible] = useState(false);
  const disabled = useFieldDisabled(props.disabled);
  return (
    <TextInput
      {...props}
      type={visible ? "text" : "password"}
      suffix={
        <button
          className="ui-input-password-icon"
          type="button"
          disabled={disabled}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible(!visible)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
      }
    />
  );
}
type SearchProps = Omit<InputProps, "onSearch"> & {
  onSearch?: (value: string) => void;
  enterButton?: ReactNode;
  loading?: boolean;
};
function Search({
  onSearch,
  enterButton,
  loading,
  disabled: providedDisabled,
  onPressEnter,
  style,
  className,
  onChange,
  ...props
}: SearchProps) {
  const ref = useRef<InputRef>(null);
  const disabled = useFieldDisabled(providedDisabled);
  const search = () => {
    if (!disabled && !loading) onSearch?.(ref.current?.input?.value ?? "");
  };
  return (
    <span className={`ui-input-search ${className ?? ""}`} style={style}>
      <TextInput
        type="search"
        {...props}
        ref={ref}
        disabled={disabled}
        onChange={onChange}
        onClear={() => {
          props.onClear?.();
          if (!disabled && !loading) onSearch?.("");
        }}
        onPressEnter={(event) => {
          onPressEnter?.(event);
          if (!event.defaultPrevented && !event.nativeEvent.isComposing) {
            event.preventDefault();
            search();
          }
        }}
      />
      <button
        type="button"
        className="ui-input-search-button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        onClick={search}
      >
        {enterButton === true || !enterButton ? "搜索" : enterButton}
      </button>
    </span>
  );
}
export const Input = Object.assign(TextInput, { TextArea, Password, Search });
export interface InputNumberProps<T extends ValueType = number> extends Omit<
  RcNumberProps<T>,
  "size"
> {
  size?: Size;
  status?: InputStyle["status"];
}
export function InputNumber<T extends ValueType = number>({
  size,
  status,
  disabled,
  className,
  ...props
}: InputNumberProps<T>) {
  return (
    <RcNumber<T>
      {...props}
      prefixCls="ui-input-number"
      upHandler="▴"
      downHandler="▾"
      className={fieldClass("ui-input-number", { size, status }, className)}
      disabled={useFieldDisabled(disabled)}
    />
  );
}
