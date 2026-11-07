import {
  Children,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode
} from "react";

export type Size = "small" | "middle" | "large";
type Div = ComponentPropsWithRef<"div">;
const gaps = { small: 8, middle: 16, large: 24 };
export function Flex({
  vertical,
  gap,
  align,
  justify,
  wrap,
  style,
  className = "",
  ...props
}: Div & {
  vertical?: boolean;
  gap?: Size | CSSProperties["gap"];
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  wrap?: CSSProperties["flexWrap"] | boolean;
}) {
  return (
    <div
      {...props}
      className={`ui-flex ${className}`}
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : undefined,
        gap: typeof gap === "string" && gap in gaps ? gaps[gap as Size] : gap,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap === true ? "wrap" : wrap || undefined,
        ...style
      }}
    />
  );
}

type SpaceProps = Div & {
  align?: CSSProperties["alignItems"];
  direction?: "horizontal" | "vertical";
  orientation?: "horizontal" | "vertical";
  size?: Size | number | [number, number];
  wrap?: boolean;
  styles?: { item?: CSSProperties };
};
export function Space({
  align,
  direction,
  orientation = direction ?? "horizontal",
  size = "small",
  wrap,
  styles,
  style,
  className = "",
  children,
  ...props
}: SpaceProps) {
  const gap = typeof size === "string" ? gaps[size] : size;
  return (
    <div
      {...props}
      className={`ui-space ui-space-${orientation} ${className}`}
      style={{
        display: "inline-flex",
        flexDirection: orientation === "vertical" ? "column" : "row",
        alignItems:
          align ?? (orientation === "horizontal" ? "center" : undefined),
        flexWrap: wrap ? "wrap" : undefined,
        gap: Array.isArray(gap) ? `${gap[1]}px ${gap[0]}px` : gap,
        ...style
      }}
    >
      {Children.toArray(children).map((child, i) => (
        <div
          key={typeof child === "object" && "key" in child ? child.key : i}
          className="ui-space-item"
          style={styles?.item}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
Space.Compact = function Compact({
  block,
  size,
  className = "",
  style,
  ...props
}: Div & { block?: boolean; size?: Size }) {
  return (
    <div
      {...props}
      data-size={size}
      className={`ui-space-compact ${className}`}
      style={{
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        ...style
      }}
    />
  );
};

export function Row({
  gutter = 0,
  className = "",
  style,
  ...props
}: Div & { gutter?: number | [number, number] }) {
  const [x, y] = Array.isArray(gutter) ? gutter : [gutter, 0];
  return (
    <div
      {...props}
      className={`ui-row ${className}`}
      style={{ "--ui-gutter": `${x}px`, rowGap: y, ...style } as CSSProperties}
    />
  );
}
export function Col({
  xs,
  md,
  lg,
  xl,
  span = 24,
  style,
  ...props
}: Div & {
  xs?: number;
  md?: number;
  lg?: number;
  xl?: number;
  span?: number;
  children?: ReactNode;
}) {
  return (
    <div
      {...props}
      className="ui-col"
      style={
        {
          "--ui-col": xs ?? span,
          "--ui-md": md,
          "--ui-lg": lg,
          "--ui-xl": xl,
          ...style
        } as CSSProperties
      }
    />
  );
}
const mdQuery = "(min-width: 768px)";
function subscribe(notify: () => void) {
  const m = matchMedia(mdQuery);
  m.addEventListener("change", notify);
  return () => m.removeEventListener("change", notify);
}
export function useMediumScreen() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(mdQuery).matches,
    () => false
  );
}
