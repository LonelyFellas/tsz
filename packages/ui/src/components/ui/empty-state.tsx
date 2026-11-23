import type { ComponentPropsWithRef, ReactNode } from "react";
import "./empty-state.css";

/** 空集合或无匹配：描述与下一步操作均可省略，不生成占位图或默认文案。 */
export function EmptyState({
  empty = true,
  description,
  children,
  className = "",
  ...props
}: ComponentPropsWithRef<"div"> & {
  description?: ReactNode;
  empty?: boolean;
}) {
  return (
    <div
      {...props}
      className={
        [empty && "tsz-empty-state", className].filter(Boolean).join(" ") ||
        undefined
      }
    >
      {empty && description != null && (
        <div className="tsz-empty-description">{description}</div>
      )}
      {children}
    </div>
  );
}
