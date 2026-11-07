import Fields, {
  Field,
  FieldContext,
  List,
  useForm,
  useWatch,
  type FieldProps,
  type FormInstance,
  type FormProps as StoreFormProps,
  type Meta
} from "@rc-component/form";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";
import { AdminControls, useAdminDisabled } from "../context";

type Column = { span?: number; offset?: number; flex?: CSSProperties["flex"] };
type Layout = "horizontal" | "inline" | "vertical";
interface LayoutProps {
  labelCol?: Column;
  wrapperCol?: Column;
  labelAlign?: "left" | "right";
  colon?: boolean;
  layout?: Layout;
}
const FormLayout = createContext<
  LayoutProps & { name?: string; disabled?: boolean; requiredMark?: boolean }
>({});
export function useFieldDisabled(disabled?: boolean) {
  const fromApp = useAdminDisabled();
  const form = useContext(FormLayout);
  return disabled ?? form.disabled ?? fromApp;
}

type FormProps<Values> = StoreFormProps<Values> &
  LayoutProps & { disabled?: boolean; requiredMark?: boolean };
function FormRoot<Values>({
  name,
  disabled,
  requiredMark,
  validateMessages,
  labelCol,
  wrapperCol,
  labelAlign,
  colon,
  layout = "horizontal",
  className = "",
  ...props
}: FormProps<Values>) {
  return (
    <FormLayout.Provider
      value={{
        name,
        disabled,
        requiredMark,
        labelCol,
        wrapperCol,
        labelAlign,
        colon,
        layout
      }}
    >
      <AdminControls componentDisabled={disabled}>
        <Fields
          {...props}
          validateMessages={{
            required: "请填写${label}",
            whitespace: "${label}不能只包含空格",
            ...validateMessages
          }}
          name={name}
          className={`ui-form ui-form-${layout} ${className}`}
        />
      </AdminControls>
    </FormLayout.Provider>
  );
}

function columnStyle(col?: Column): CSSProperties | undefined {
  if (!col) return;
  // A field label given a length is fixed; only the control consumes spare space.
  const flex =
    typeof col.flex === "string" &&
    /^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(col.flex)
      ? `0 0 ${col.flex}`
      : col.flex;
  return {
    flex:
      flex ??
      (col.span === undefined ? undefined : `0 0 ${(col.span / 24) * 100}%`),
    marginInlineStart: col.offset ? `${(col.offset / 24) * 100}%` : undefined
  };
}

type ItemProps = Omit<FieldProps, "children"> &
  LayoutProps & {
    label?: ReactNode;
    children?: ReactNode;
    required?: boolean;
    hidden?: boolean;
    noStyle?: boolean;
    htmlFor?: string;
    tooltip?: ReactNode;
    help?: ReactNode;
    extra?: ReactNode;
    className?: string;
    style?: CSSProperties;
    validateStatus?: string;
  };

function Item({
  label,
  children,
  required,
  hidden,
  noStyle,
  htmlFor,
  tooltip,
  help,
  extra,
  className = "",
  style,
  validateStatus,
  labelCol,
  wrapperCol,
  labelAlign,
  colon,
  layout,
  ...field
}: ItemProps) {
  const defaults = useContext(FormLayout);
  const fallback = useId();
  function content(control?: Record<string, unknown>, meta?: Meta) {
    const input = isValidElement(children)
      ? (children as ReactElement<Record<string, unknown>>)
      : undefined;
    const id =
      htmlFor ??
      (input?.props.id as string | undefined) ??
      [defaults.name, ...(meta?.name ?? [])]
        .filter((v) => v !== undefined)
        .join("_");
    const inputId = id || fallback;
    const errors = meta?.errors ?? [];
    const invalid = validateStatus === "error" || !!errors.length;
    const mandatory =
      required ??
      field.rules?.some(
        (rule) =>
          typeof rule === "object" && "required" in rule && rule.required
      );
    const description =
      help ?? (errors.length ? <ErrorList errors={errors} /> : null);
    const bind: Record<string, unknown> = { ...control };
    if (input && !noStyle) {
      // 显式 htmlFor 由调用端指向内部控件，不把同一 ID 写到组合字段外壳。
      const nativeControl =
        typeof input.type === "string" &&
        [
          "input",
          "textarea",
          "select",
          "button",
          "output",
          "progress",
          "meter"
        ].includes(input.type);
      if (htmlFor ? nativeControl : label || meta) bind.id = inputId;
      if (invalid) bind["aria-invalid"] = true;
      if (mandatory) bind["aria-required"] = true;
      const desc = [
        input.props["aria-describedby"],
        description && `${inputId}-help`,
        extra && `${inputId}-extra`
      ]
        .filter(Boolean)
        .join(" ");
      if (desc) bind["aria-describedby"] = desc;
    }
    if (input && control) {
      for (const [key, handler] of Object.entries(control)) {
        const original = input.props[key];
        if (typeof handler === "function" && typeof original === "function")
          bind[key] = (...args: unknown[]) => {
            handler(...args);
            original(...args);
          };
      }
    }
    const child = input ? cloneElement(input, bind) : children;
    if (noStyle) return child;
    const itemLayout = layout ?? defaults.layout;
    const showMark = mandatory && defaults.requiredMark !== false;
    return (
      <div
        hidden={hidden}
        style={style}
        className={`ui-form-item ui-form-item-${itemLayout} ${invalid ? "ui-form-item-has-error" : ""} ${className}`}
      >
        <div className="ui-form-item-row">
          {label != null && (
            <div
              className="ui-form-item-label"
              style={{
                ...columnStyle(labelCol ?? defaults.labelCol),
                textAlign: labelAlign ?? defaults.labelAlign
              }}
            >
              <label
                htmlFor={inputId}
                className={showMark ? "ui-form-item-required" : undefined}
                title={typeof tooltip === "string" ? tooltip : undefined}
              >
                {label}
                {(colon ?? defaults.colon) && (
                  <span aria-hidden="true">：</span>
                )}
              </label>
            </div>
          )}
          <div
            className="ui-form-item-control"
            style={columnStyle(wrapperCol ?? defaults.wrapperCol)}
          >
            <div className="ui-form-item-control-input">
              <div className="ui-form-item-control-input-content">{child}</div>
            </div>
            {description && (
              <div
                id={`${inputId}-help`}
                className={
                  invalid
                    ? "ui-form-item-explain-error"
                    : "ui-form-item-explain"
                }
              >
                {description}
              </div>
            )}
            {extra && (
              <div id={`${inputId}-extra`} className="ui-form-item-extra">
                {extra}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return field.name === undefined ? (
    content()
  ) : (
    <Field
      {...field}
      messageVariables={{
        label: typeof label === "string" ? label : String(field.name),
        ...field.messageVariables
      }}
    >
      {content}
    </Field>
  );
}
function ErrorList({ errors = [] }: { errors?: ReactNode[] }) {
  return (
    <>
      {errors.map((error, index) => (
        <div key={index} role="alert">
          {error}
        </div>
      ))}
    </>
  );
}
function useFormInstance<V>() {
  return useContext(FieldContext) as FormInstance<V>;
}
export const Form = Object.assign(FormRoot, {
  Item,
  List,
  ErrorList,
  useForm,
  useFormInstance,
  useWatch
});
