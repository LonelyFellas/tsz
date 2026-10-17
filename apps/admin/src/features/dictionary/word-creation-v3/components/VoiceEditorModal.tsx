import Close from "@mui/icons-material/Close";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

export function VoiceEditorModal({
  title,
  open,
  children,
  footer,
  onClose,
  closeDisabled = false,
  escapeDisabled = false,
  contentSx
}: {
  title: ReactNode;
  open: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  escapeDisabled?: boolean;
  contentSx?: SxProps<Theme>;
}) {
  const titleId = useId();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; left: number; top: number }>(
    null
  );
  useEffect(() => {
    if (!open) setPosition({ x: 0, y: 0 });
  }, [open]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = {
      x: drag.current.left + event.clientX - drag.current.x,
      y: drag.current.top + event.clientY - drag.current.y
    };
    const rect = event.currentTarget.getBoundingClientRect();
    next.x = Math.min(
      window.innerWidth - rect.right + position.x,
      Math.max(position.x - rect.left, next.x)
    );
    next.y = Math.min(
      window.innerHeight - rect.bottom + position.y,
      Math.max(position.y - rect.top, next.y)
    );
    setPosition(next);
  };
  return (
    <Dialog
      open={open}
      maxWidth={false}
      aria-labelledby={titleId}
      disableEscapeKeyDown={escapeDisabled || closeDisabled}
      onClose={(_, reason) => {
        if (!closeDisabled && reason !== "backdropClick") onClose();
      }}
      slotProps={{
        paper: {
          sx: {
            width: 960,
            maxWidth: "calc(100% - 32px)",
            m: 2,
            overflow: "visible"
          },
          style: { transform: `translate(${position.x}px, ${position.y}px)` }
        }
      }}
    >
      <DialogTitle
        id={titleId}
        component="div"
        sx={{ cursor: "move", touchAction: "none", userSelect: "none", pr: 7 }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: position.x,
            top: position.y
          };
        }}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        {title}
        <IconButton
          aria-label="关闭编辑器"
          disabled={closeDisabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={contentSx ?? { maxHeight: "70vh", overflowY: "auto" }}>
        {children}
      </DialogContent>
      {footer && (
        <DialogActions data-editor-dialog-footer>{footer}</DialogActions>
      )}
    </Dialog>
  );
}
