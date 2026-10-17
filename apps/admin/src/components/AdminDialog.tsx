import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import { useId } from "react";
import type { ReactNode } from "react";

/** 统一业务弹窗的标题、正文和操作区，业务提交状态由调用方持有。 */
export function AdminDialog({
  open,
  title,
  children,
  actions,
  onClose,
  closeDisabled = false,
  escapeDisabled = false,
  backdropDismiss = true,
  width = 600,
  className,
  topOffset
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  escapeDisabled?: boolean;
  backdropDismiss?: boolean;
  width?: number | string;
  className?: string;
  topOffset?: number;
}) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      aria-labelledby={titleId}
      className={className}
      sx={
        topOffset === undefined
          ? undefined
          : { "& .MuiDialog-container": { alignItems: "flex-start" } }
      }
      maxWidth={false}
      disableEscapeKeyDown={escapeDisabled}
      onClose={(_, reason) => {
        if (!closeDisabled && (backdropDismiss || reason !== "backdropClick"))
          onClose();
      }}
      slotProps={{
        paper: {
          sx: { width, maxWidth: "calc(100vw - 32px)" },
          style: topOffset === undefined ? undefined : { marginTop: topOffset }
        }
      }}
    >
      <DialogTitle id={titleId} sx={{ pr: 7 }}>
        {title}
        <IconButton
          aria-label="关闭"
          disabled={closeDisabled}
          onClick={onClose}
          sx={{ position: "absolute", right: 12, top: 12 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </Dialog>
  );
}
