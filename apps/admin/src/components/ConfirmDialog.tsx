import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from "@mui/material";
import { useId } from "react";
import type { ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmText = "确认",
  cancelText = "取消",
  confirmDisabled = false,
  closeOnBackdrop = true,
  danger = false,
  pending = false,
  error,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmDisabled?: boolean;
  closeOnBackdrop?: boolean;
  danger?: boolean;
  pending?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (!pending && (closeOnBackdrop || reason !== "backdropClick"))
          onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        {children}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          {cancelText}
        </Button>
        <Button
          variant="contained"
          color={danger ? "error" : "primary"}
          loading={pending}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
