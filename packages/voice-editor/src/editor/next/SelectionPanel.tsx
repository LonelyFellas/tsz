import { ClickAwayListener, Paper, Popper } from "@mui/material";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  const updatePosition = useRef<(() => void) | null>(null);
  const bindPopper = useCallback(
    (instance: { update(): Promise<unknown> } | null) => {
      updatePosition.current = instance
        ? () => {
            void instance.update();
          }
        : null;
    },
    []
  );
  useLayoutEffect(() => {
    if (!open || !surface) return;
    const popup = surface;
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => updatePosition.current?.());
    if (popup) observer?.observe(popup);
    return () => {
      observer?.disconnect();
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
      {children}
      <Popper
        popperRef={bindPopper}
        modifiers={[
          {
            name: "preventOverflow",
            options: {
              padding: 12,
              altAxis: true,
              tether: false,
              boundary: "viewport"
            }
          },
          { name: "flip", options: { padding: 12 } }
        ]}
        open={open}
        anchorEl={() => anchor.current?.firstElementChild as HTMLElement}
        placement={placement}
        container={() =>
          anchor.current?.closest<HTMLElement>('[role="dialog"]') ??
          document.body
        }
        sx={{ zIndex: 1500 }}
      >
        <ClickAwayListener onClickAway={() => onDismiss?.()}>
          <Paper
            ref={setSurface}
            className="tsz-ve-pop-overlay"
            elevation={8}
            sx={{
              p: 1.5,
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
          </Paper>
        </ClickAwayListener>
      </Popper>
    </span>
  );
}
