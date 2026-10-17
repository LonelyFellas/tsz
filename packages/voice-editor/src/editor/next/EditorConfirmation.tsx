import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from "@mui/material";
import { useId } from "react";
import type { ReactNode } from "react";

/** 编辑器持有待确认的业务状态；此组件只呈现确认与取消操作。 */
export function EditorConfirmation({
  open,
  title,
  children,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel = "取消",
  disabled = false,
  danger = false,
  width = 470
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  width?: number;
}) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby={titleId}
      maxWidth={false}
      slotProps={{ paper: { sx: { width, maxWidth: "calc(100vw - 32px)" } } }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={danger ? "error" : "primary"}
          disabled={disabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
