import { Popover } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** 非模态浮层允许字段获取焦点，保留编辑器持有的业务选区。 */
export function SelectionPanel({
  open,
  content,
  children,
  placement = "bottom-start",
  onDismiss
}: {
  open: boolean;
  content: ReactNode;
  children: ReactNode;
  placement?: "bottom-start" | "top-start";
  onDismiss?: () => void;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open || !surface) return;
    const popup = surface;
    return () => {
      queueMicrotask(() => {
        if (
          document.activeElement !== document.body &&
          !popup?.contains(document.activeElement)
        )
          return;
        const trigger =
          anchor.current?.querySelector<HTMLElement>("button, [tabindex]");
        const input = anchor.current
          ?.closest(".tsz-ve-editor")
          ?.querySelector<HTMLTextAreaElement>("textarea.tsz-ve-canvas-input");
        (trigger ?? input)?.focus({ preventScroll: true });
      });
    };
  }, [open, surface]);
  return (
    <span ref={anchor} style={{ display: "contents" }}>
      <Popover
        fresh
        styles={{ root: { pointerEvents: "auto" } }}
        open={open}
        trigger={onDismiss ? "click" : []}
        onOpenChange={(next) => {
          if (!next) onDismiss?.();
        }}
        placement={placement === "top-start" ? "topLeft" : "bottomLeft"}
        getPopupContainer={() =>
          anchor.current?.closest<HTMLElement>('[role="dialog"]') ??
          document.body
        }
        classNames={{ root: "tsz-ve-pop-overlay" }}
        content={
          open ? (
            <div
              ref={setSurface}
              style={{
                maxWidth: "min(900px, 95vw)",
                maxHeight: "80vh",
                overflow: "auto"
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && onDismiss) {
                  event.stopPropagation();
                  onDismiss();
                }
              }}
            >
              {content}
            </div>
          ) : null
        }
      >
        {children}
      </Popover>
    </span>
  );
}
