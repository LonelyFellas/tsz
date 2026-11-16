import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { useFieldDisabled } from "./Form";
import { Checkbox as ShadcnCheckbox } from "../../components/ui/checkbox";
import { Switch as ShadcnSwitch } from "../../components/ui/switch";
import { Slider as ShadcnSlider } from "../../components/ui/slider";
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
type CheckChangeEvent = {
  target: { checked: boolean; value: ChoiceValue; name: string };
  nativeEvent: Event;
  stopPropagation: () => void;
  preventDefault: () => void;
};
type CheckProps = Omit<
  ComponentPropsWithoutRef<typeof ShadcnCheckbox>,
  "value" | "checked" | "defaultChecked" | "onCheckedChange" | "onChange"
> & {
  value?: ChoiceValue;
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  onChange?: (event: CheckChangeEvent) => void;
};
function Check({
  value,
  checked,
  defaultChecked = false,
  disabled,
  indeterminate,
  className = "",
  style,
  title,
  children,
  name,
  onChange,
  onClick,
  ...props
}: CheckProps) {
  const group = useContext(Checks);
  const [local, setLocal] = useState(defaultChecked);
  const off = useFieldDisabled(disabled ?? group?.disabled);
  const active =
    group && value !== undefined
      ? group.value.includes(value)
      : (checked ?? local);
  return (
    <label
      style={style}
      title={title}
      className={`ui-checkbox-wrapper ${active ? "ui-checkbox-wrapper-checked" : ""} ${off ? "ui-checkbox-wrapper-disabled" : ""} ${className}`}
    >
      <span className="ui-checkbox">
        <ShadcnCheckbox
          {...props}
          className="ui-checkbox-input"
          name={name}
          value={value === undefined ? "on" : String(value)}
          checked={indeterminate ? "indeterminate" : active}
          disabled={off}
          onClick={(event) => {
            onClick?.(event);
            if (event.defaultPrevented || off) return;
            const next = !active;
            setLocal(next);
            onChange?.({
              target: { checked: next, value: value ?? "on", name: name ?? "" },
              nativeEvent: event.nativeEvent,
              stopPropagation: () => event.stopPropagation(),
              preventDefault: () => event.preventDefault()
            });
            if (value !== undefined) group?.toggle(value, next);
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
  "onChange" | "defaultValue" | "dir"
> & {
  options: ReadonlyArray<Option<V>>;
  value?: V;
  defaultValue?: V;
  disabled?: boolean;
  name?: string;
  dir?: "ltr" | "rtl";
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
    <ShadcnRadioGroup
      {...props}
      name={name ?? id}
      value={String(value ?? local ?? "")}
      disabled={off}
      onValueChange={(next) => {
        const selected = options
          .map(unpack)
          .find((option) => String(option.value) === next);
        if (!selected || selected.disabled || off) return;
        setLocal(selected.value);
        onChange?.(selected.value);
      }}
      className={`ui-segmented ui-segmented-${size ?? "middle"} ${className}`}
    >
      <div className="ui-segmented-group">
        {options.map((item) => {
          const option = unpack(item);
          const active = (value ?? local) === option.value;
          return (
            <RadioGroupItem
              key={String(option.value)}
              value={String(option.value)}
              disabled={off || option.disabled}
              title={option.title}
              onFocus={(event) => {
                if (active || off || option.disabled) return;
                // 分段选择跟随焦点，快速按键也应在 Radix 移焦后完成选中。
                event.preventDefault();
                event.currentTarget.click();
              }}
              className={`ui-segmented-item ${active ? "ui-segmented-item-selected" : ""}`}
            >
              <span className="ui-segmented-item-label">{option.label}</span>
            </RadioGroupItem>
          );
        })}
      </div>
    </ShadcnRadioGroup>
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
    <ShadcnSwitch
      {...props}
      checked={active}
      aria-busy={loading}
      className={`ui-switch ${active ? "ui-switch-checked" : ""} ${className}`}
      disabled={off || loading}
      onCheckedChange={(next) => {
        setLocal(next);
        onChange?.(next);
      }}
    >
      {(active ? checkedChildren : unCheckedChildren) != null && (
        <span className="ui-switch-inner">
          {active ? checkedChildren : unCheckedChildren}
        </span>
      )}
    </ShadcnSwitch>
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
    <ShadcnSlider
      {...props}
      className="ui-slider"
      title={typeof title === "string" ? title : undefined}
      aria-label={ariaLabelForHandle}
      value={[value ?? 0]}
      onValueChange={([next]) => onChange?.(next!)}
      disabled={useFieldDisabled(disabled)}
    />
  );
}
export { ColorPicker } from "./ColorPicker";
