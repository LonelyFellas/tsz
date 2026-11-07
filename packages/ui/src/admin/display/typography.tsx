import { Check, Copy, Pencil } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode
} from "react";

interface TextProps extends ComponentPropsWithoutRef<"span"> {
  type?: "secondary" | "danger" | "success" | "warning";
  strong?: boolean;
  code?: boolean;
  ellipsis?:
    | boolean
    | {
        tooltip?: ReactNode;
        rows?: number;
        onEllipsis?: (truncated: boolean) => void;
      };
  copyable?: boolean | { text?: string; tooltips?: ReactNode | ReactNode[] };
  editable?:
    | false
    | {
        tooltip?: string;
        maxLength?: number;
        onChange: (text: string) => void;
      };
}
function TextBlock({
  as: Component = "span",
  type,
  strong,
  code,
  ellipsis,
  copyable,
  editable,
  children,
  className = "",
  style,
  title,
  ...props
}: TextProps & { as?: ElementType }) {
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState("");
  const rows = typeof ellipsis === "object" ? ellipsis.rows : undefined;
  const onEllipsis =
    typeof ellipsis === "object" ? ellipsis.onEllipsis : undefined;
  const tooltip = typeof ellipsis === "object" ? ellipsis.tooltip : undefined;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onEllipsis) return;
    const measure = () =>
      onEllipsis(
        el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onEllipsis, children]);
  const tip =
    typeof copyable === "object" && Array.isArray(copyable.tooltips)
      ? copyable.tooltips[copied ? 1 : 0]
      : undefined;
  const copyLabel = typeof tip === "string" ? tip : copied ? "已复制" : "复制";
  const finish = (commit: boolean) => {
    if (commit && editable) editable.onChange(draft.trim());
    setEditing(false);
  };
  let body = children;
  if (strong) body = <strong>{body}</strong>;
  if (code) body = <code>{body}</code>;
  return (
    <Component
      {...props}
      ref={ref}
      title={title ?? (typeof tooltip === "string" ? tooltip : undefined)}
      className={`ui-typography ${type ? `ui-typography-${type}` : ""} ${ellipsis ? "ui-typography-ellipsis" : ""} ${className}`}
      style={{
        ...(rows
          ? {
              display: "-webkit-box",
              WebkitLineClamp: rows,
              WebkitBoxOrient: "vertical",
              whiteSpace: "normal"
            }
          : {}),
        ...style
      }}
    >
      {editing ? (
        <textarea
          aria-label={(editable && editable.tooltip) || "编辑"}
          autoFocus
          maxLength={editable ? editable.maxLength : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              finish(true);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              finish(false);
            }
          }}
        />
      ) : (
        body
      )}
      {editable && !editing && (
        <button
          className="ui-typography-edit ui-icon-action"
          type="button"
          aria-label={editable.tooltip ?? "编辑"}
          title={editable.tooltip}
          onClick={() => {
            setDraft(
              typeof children === "string"
                ? children
                : (ref.current?.textContent ?? "")
            );
            setEditing(true);
          }}
        >
          <Pencil />
        </button>
      )}
      {copyable && (
        <button
          type="button"
          className="ui-typography-copy ui-icon-action"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={async () => {
            const value =
              typeof copyable === "object" ? copyable.text : undefined;
            try {
              await navigator.clipboard.writeText(
                value ?? ref.current?.textContent ?? ""
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
        </button>
      )}
    </Component>
  );
}
export const Typography = {
  Text: TextBlock,
  Paragraph: (props: TextProps) => <TextBlock {...props} as="div" />,
  Link: ({ className = "", ...props }: ComponentPropsWithoutRef<"a">) => (
    <a {...props} className={`ui-typography ui-link ${className}`} />
  ),
  Title: ({
    level = 1,
    ...props
  }: TextProps & { level?: 1 | 2 | 3 | 4 | 5 }) => (
    <TextBlock
      {...props}
      as={`h${level}`}
      className={`ui-typography-h${level} ${props.className ?? ""}`}
    />
  )
};
