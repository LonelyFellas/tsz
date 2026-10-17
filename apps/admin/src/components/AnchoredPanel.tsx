import { ClickAwayListener, Paper, Popper } from "@mui/material";
import type { PopperProps } from "@mui/material";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** 可输入的非模态面板；Esc 只关闭本层，关闭后恢复触发按钮焦点。 */
export function AnchoredPanel({
  anchor,
  open,
  label,
  onClose,
  children,
  placement = "bottom-end"
}: {
  anchor: HTMLElement | null;
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: PopperProps["placement"];
}) {
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
          document.activeElement === document.body ||
          popup?.contains(document.activeElement)
        )
          anchor?.focus({ preventScroll: true });
      });
    };
  }, [open, anchor, surface]);
  return (
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
      open={open && !!anchor}
      anchorEl={anchor}
      placement={placement}
      container={() =>
        anchor?.closest<HTMLElement>('[role="dialog"]') ?? document.body
      }
      sx={{ zIndex: 1500 }}
    >
      <ClickAwayListener onClickAway={onClose}>
        <Paper
          ref={setSurface}
          role="dialog"
          aria-label={label}
          elevation={8}
          sx={{
            p: 2,
            maxWidth: "min(760px,95vw)",
            maxHeight: "80vh",
            overflow: "auto"
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
        >
          {children}
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
