import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./V3StepActions.css";

export function V3StepActions({
  children,
  status
}: {
  children: ReactNode;
  status?: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{
    left: number;
    width: number;
    bottom: number;
  }>();

  useLayoutEffect(() => {
    const shell = anchor.current?.closest<HTMLElement>(".word-creation-shell");
    const summary = shell?.querySelector<HTMLElement>(".word-creation-summary");
    if (!shell || !summary) return;
    const follow = () => {
      const rect = shell.getBoundingClientRect();
      if (rect.width === 0) return;
      const style = getComputedStyle(shell);
      const left =
        style.display === "grid"
          ? summary.getBoundingClientRect().right
          : rect.left + parseFloat(style.borderLeftWidth);
      const width = rect.right - parseFloat(style.borderRightWidth) - left;
      const bottom = Math.max(
        0,
        window.innerHeight - rect.bottom + parseFloat(style.borderBottomWidth)
      );
      setBounds((current) =>
        current?.left === left &&
        current.width === width &&
        current.bottom === bottom
          ? current
          : { left, width, bottom }
      );
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(shell);
    observer.observe(summary);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow);
    };
  }, []);

  // 浮动助手需要避开底栏；窄屏按钮换行后，不能继续假设固定的底栏高度。
  useLayoutEffect(() => {
    const actions = actionsRef.current;
    if (!actions || !bounds) return;
    const root = document.documentElement;
    const variable = "--word-step-actions-clearance";
    const previous = root.style.getPropertyValue(variable);
    const update = () => {
      root.style.setProperty(
        variable,
        `${Math.max(0, window.innerHeight - actions.getBoundingClientRect().top)}px`
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(actions);
    update();
    return () => {
      observer.disconnect();
      if (previous) root.style.setProperty(variable, previous);
      else root.style.removeProperty(variable);
    };
  }, [bounds]);

  const actions = (
    <div ref={actionsRef} className="word-step-actions">
      {status && (
        <span className="v3-draft-status" role="status">
          {status}
        </span>
      )}
      {children}
    </div>
  );
  return (
    <div ref={anchor}>
      {bounds
        ? createPortal(
            <div
              className="v3-step-actions"
              data-at-end={bounds.bottom > 0}
              style={bounds}
            >
              {actions}
            </div>,
            document.body
          )
        : actions}
    </div>
  );
}
