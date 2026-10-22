import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./V3StepActions.css";

export function V3StepActions({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
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

  return (
    <div ref={anchor}>
      {bounds ? (
        createPortal(
          <div
            className="v3-step-actions"
            data-at-end={bounds.bottom > 0}
            style={bounds}
          >
            <div className="word-step-actions">{children}</div>
          </div>,
          document.body
        )
      ) : (
        <div className="word-step-actions">{children}</div>
      )}
    </div>
  );
}
