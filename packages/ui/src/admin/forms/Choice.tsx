import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode
} from "react";
import { useFieldDisabled } from "./Form";
import {
  RadioGroup as ShadcnRadioGroup,
  RadioGroupItem
} from "../../components/ui/radio-group";

type ChoiceValue = string | number | boolean;
type Option<V> =
  V | { value: V; label: ReactNode; disabled?: boolean; title?: string };
function unpack<V extends ChoiceValue>(item: Option<V>) {
  return typeof item === "object" ? item : { value: item, label: String(item) };
}
const Checks = createContext<{
  value: ChoiceValue[];
  disabled: boolean;
  toggle: (value: ChoiceValue, checked: boolean) => void;
} | null>(null);
type CheckProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "size"
> & { value?: ChoiceValue; indeterminate?: boolean };
function Check({
  value,
  checked,
  disabled,
  indeterminate,
  className = "",
  style,
  title,
  children,
  onChange,
  ...props
}: CheckProps) {
  const group = useContext(Checks),
    ref = useRef<HTMLInputElement>(null);
  const off = useFieldDisabled(disabled ?? group?.disabled);
  const active =
    group && value !== undefined ? group.value.includes(value) : checked;
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label
      style={style}
      title={title}
      className={`ui-checkbox-wrapper ${active ? "ui-checkbox-wrapper-checked" : ""} ${off ? "ui-checkbox-wrapper-disabled" : ""} ${className}`}
    >
      <span className={`ui-checkbox ${active ? "ui-checkbox-checked" : ""}`}>
        <input
          {...props}
          ref={ref}
          type="checkbox"
          className="ui-checkbox-input"
          value={value === undefined ? undefined : String(value)}
          checked={active}
          disabled={off}
          onChange={(event) => {
            onChange?.(event);
            if (value !== undefined) group?.toggle(value, event.target.checked);
          }}
        />
      </span>
      {children != null && (
        <span className="ui-checkbox-label">{children}</span>
      )}
    </label>
  );
}
type CheckGroupProps<V extends ChoiceValue> = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> & {
  options?: Option<V>[];
  disabled?: boolean;
  value?: V[];
  defaultValue?: V[];
  onChange?: (v: V[]) => void;
};
function CheckGroup<V extends ChoiceValue = string>({
  options,
  disabled,
  children,
  value,
  defaultValue = [],
  onChange,
  className = "",
  ...props
}: CheckGroupProps<V>) {
  const [local, setLocal] = useState(defaultValue);
  const current = value ?? local;
  const off = useFieldDisabled(disabled);
  const toggle = (v: ChoiceValue, checked: boolean) => {
    const next = checked
      ? [...current, v as V]
      : current.filter((i) => i !== v);
    setLocal(next);
    onChange?.(next);
  };
  return (
    <Checks.Provider value={{ value: current, disabled: !!off, toggle }}>
      <div {...props} className={`ui-checkbox-group ${className}`}>
        {options
          ? options.map((i) => {
              const o = unpack(i);
              return (
                <Check
                  key={String(o.value)}
                  value={o.value}
                  disabled={o.disabled || off}
                >
                  {o.label}
                </Check>
              );
            })
          : children}
      </div>
    </Checks.Provider>
  );
}
export const Checkbox = Object.assign(Check, { Group: CheckGroup });

type RadioChangeEvent<V extends ChoiceValue> = {
  target: { value: V; checked: boolean; name: string };
  nativeEvent: Event;
  stopPropagation: () => void;
  preventDefault: () => void;
};
const Radios = createContext<{
  name: string;
  value?: ChoiceValue;
  disabled?: boolean;
  button: boolean;
  change: (event: RadioChangeEvent<ChoiceValue>) => void;
} | null>(null);
type RadioProps = Omit<
  ComponentPropsWithoutRef<typeof RadioGroupItem>,
  "value" | "onChange"
> & {
  value?: ChoiceValue;
  checked?: boolean;
  defaultChecked?: boolean;
  name?: string;
  onChange?: (event: RadioChangeEvent<ChoiceValue>) => void;
  button?: boolean;
};
function RadioInput({
  value,
  checked,
  defaultChecked = false,
  disabled,
  children,
  className = "",
  style,
  title,
  name,
  button,
  onChange,
  onClick,
  ...props
}: RadioProps) {
  const group = useContext(Radios);
  const [local, setLocal] = useState(defaultChecked);
  const off = useFieldDisabled(disabled || group?.disabled);
  const active = group ? value === group.value : (checked ?? local);
  const prefix = button || group?.button ? "ui-radio-button" : "ui-radio";
  const labelId = useId();
  const itemValue = value === undefined ? "on" : String(value);
  const label = children != null && (
    <span id={labelId} className="ui-radio-label">
      {children}
    </span>
  );
  const item = (
    <RadioGroupItem
      {...props}
      aria-labelledby={
        props["aria-labelledby"] ??
        (prefix === "ui-radio-button" &&
        props["aria-label"] === undefined &&
        children != null
          ? labelId
          : undefined)
      }
      value={itemValue}
      disabled={off}
      className={
        prefix === "ui-radio-button"
          ? "ui-radio-button-control"
          : "ui-radio-input"
      }
      title={title}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || off || active) return;
        const change = {
          target: {
            value: value ?? "on",
            checked: true,
            name: name ?? group?.name ?? ""
          },
          nativeEvent: event.nativeEvent,
          stopPropagation: () => event.stopPropagation(),
          preventDefault: () => event.preventDefault()
        };
        onChange?.(change);
        if (group && value !== undefined) group.change(change);
        else setLocal(true);
      }}
    >
      {prefix === "ui-radio-button" ? label : null}
    </RadioGroupItem>
  );
  const control = (
    <label
      style={style}
      title={title}
      className={`${prefix}-wrapper ${active ? prefix + "-wrapper-checked" : ""} ${off ? prefix + "-wrapper-disabled" : ""} ${className}`}
    >
      {item}
      {prefix === "ui-radio" ? label : null}
    </label>
  );
  return group ? (
    control
  ) : (
    <ShadcnRadioGroup
      className="ui-radio-standalone"
      name={name}
      value={active ? itemValue : ""}
      disabled={off}
    >
      {control}
    </ShadcnRadioGroup>
  );
}
type RadioGroupProps<V extends ChoiceValue> = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> & {
  value?: V;
  defaultValue?: V;
  name?: string;
  options?: ReadonlyArray<Option<V>>;
  optionType?: "default" | "button";
  size?: string;
  disabled?: boolean;
  dir?: "ltr" | "rtl";
  onChange?: (event: RadioChangeEvent<V>) => void;
};
function RadioGroup<V extends ChoiceValue = string>({
  name,
  options,
  value,
  defaultValue,
  onChange,
  optionType,
  size,
  disabled,
  className = "",
  children,
  ...props
}: RadioGroupProps<V>) {
  const id = useId();
  const [local, setLocal] = useState(defaultValue);
  const off = useFieldDisabled(disabled);
  const change = (event: RadioChangeEvent<ChoiceValue>) => {
    setLocal(event.target.value as V);
    onChange?.({
      target: {
        value: event.target.value as V,
        checked: event.target.checked,
        name: name ?? id
      },
      nativeEvent: event.nativeEvent,
      stopPropagation: () => event.stopPropagation(),
      preventDefault: () => event.preventDefault()
    });
  };
  return (
    <Radios.Provider
      value={{
        name: name ?? id,
        value: value ?? local,
        change,
        disabled: off,
        button: optionType === "button"
      }}
    >
      <ShadcnRadioGroup
        {...props}
        name={name ?? id}
        value={(value ?? local) === undefined ? "" : String(value ?? local)}
        disabled={off}
        className={`ui-radio-group ${optionType === "button" ? "ui-radio-group-buttons ui-space-compact" : ""} ${size ? "ui-radio-group-" + size : ""} ${className}`}
      >
        {options
          ? options.map((i) => {
              const o = unpack(i);
              return (
                <RadioInput
                  key={String(o.value)}
                  value={o.value}
                  disabled={off || o.disabled}
                >
                  {o.label}
                </RadioInput>
              );
            })
          : children}
      </ShadcnRadioGroup>
    </Radios.Provider>
  );
}
export const Radio = Object.assign(RadioInput, {
  Group: RadioGroup,
  Button: (props: RadioProps) => <RadioInput {...props} button />
});
type SegmentedProps<V extends string | number> = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> & {
  options: ReadonlyArray<Option<V>>;
  value?: V;
  defaultValue?: V;
  disabled?: boolean;
  name?: string;
  size?: string;
  onChange?: (v: V) => void;
};
export function Segmented<V extends string | number = string>({
  options,
  value,
  defaultValue,
  disabled,
  name,
  size,
  className = "",
  onChange,
  ...props
}: SegmentedProps<V>) {
  const [local, setLocal] = useState(
    defaultValue ??
      (options[0] === undefined ? undefined : unpack(options[0]).value)
  );
  const id = useId();
  const off = useFieldDisabled(disabled);
  return (
    <div
      {...props}
      role="radiogroup"
      className={`ui-segmented ui-segmented-${size ?? "middle"} ${className}`}
    >
      <div className="ui-segmented-group">
        {options.map((i) => {
          const o = unpack(i),
            active = (value ?? local) === o.value;
          return (
            <label
              key={String(o.value)}
              title={o.title}
              className={`ui-segmented-item ${active ? "ui-segmented-item-selected" : ""}`}
            >
              <input
                className="ui-segmented-item-input"
                type="radio"
                name={name ?? id}
                checked={active}
                disabled={off || o.disabled}
                value={String(o.value)}
                onChange={() => {
                  setLocal(o.value);
                  onChange?.(o.value);
                }}
              />
              <span className="ui-segmented-item-label">{o.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  loading?: boolean;
  unCheckedChildren?: ReactNode;
  checkedChildren?: ReactNode;
}
export function Switch({
  checked,
  defaultChecked = false,
  onChange,
  loading,
  disabled,
  unCheckedChildren,
  checkedChildren,
  className = "",
  ...props
}: SwitchProps) {
  const [local, setLocal] = useState(defaultChecked);
  const active = checked ?? local;
  const off = useFieldDisabled(disabled);
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={active}
      aria-busy={loading}
      className={`ui-switch ${active ? "ui-switch-checked" : ""} ${className}`}
      disabled={off || loading}
      onClick={() => {
        setLocal(!active);
        onChange?.(!active);
      }}
    >
      <span className="ui-switch-handle" />
      {active ? checkedChildren : unCheckedChildren}
    </button>
  );
}
type SliderProps = {
  ariaLabelForHandle?: string;
  disabled?: boolean;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (n: number) => void;
  style?: CSSProperties;
  tooltip?: { formatter?: (value: number | undefined) => ReactNode };
};
export function Slider({
  ariaLabelForHandle,
  value,
  onChange,
  disabled,
  tooltip,
  ...props
}: SliderProps) {
  const title = tooltip?.formatter?.(value);
  return (
    <input
      {...props}
      className="ui-slider"
      type="range"
      title={typeof title === "string" ? title : undefined}
      aria-label={ariaLabelForHandle}
      aria-valuenow={value}
      value={value ?? 0}
      onChange={(e) => onChange?.(e.target.valueAsNumber)}
      disabled={useFieldDisabled(disabled)}
    />
  );
}
interface PickerColor {
  toHexString(): string;
}
interface ColorProps {
  value?: string;
  disabled?: boolean;
  format?: "hex";
  disabledAlpha?: boolean;
  disabledFormat?: boolean;
  showText?: (color: PickerColor) => ReactNode;
  onOpenChange?: (open: boolean) => void;
  onChange?: (color: PickerColor) => void;
  "aria-label"?: string;
}
export function ColorPicker({
  value = "#000000",
  disabled,
  showText,
  onOpenChange,
  onChange,
  "aria-label": label
}: ColorProps) {
  return (
    <label className="ui-color-picker-trigger">
      <input
        type="color"
        aria-label={label}
        value={value}
        disabled={useFieldDisabled(disabled)}
        onClick={() => onOpenChange?.(true)}
        onBlur={() => onOpenChange?.(false)}
        onChange={(e) => {
          const hex = e.target.value;
          onChange?.({ toHexString: () => hex });
        }}
      />
      {showText?.({ toHexString: () => value })}
    </label>
  );
}
