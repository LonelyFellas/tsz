import Close from "@mui/icons-material/Close";
import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function AdminDrawer({
  title,
  width = 720,
  onClose,
  children,
  footer
}: {
  title: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-label": title,
          ...{ "data-admin-drawer": "" },
          sx: { width, maxWidth: "100%" }
        }
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          {title}
        </Typography>
        <IconButton aria-label="关闭" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>
      <Box
        data-admin-drawer-body
        sx={{ p: 2, flex: 1, minHeight: 0, overflow: "auto" }}
      >
        {children}
      </Box>
      {footer && (
        <Box
          data-admin-drawer-footer
          sx={{ p: 2, borderTop: 1, borderColor: "divider" }}
        >
          {footer}
        </Box>
      )}
    </Drawer>
  );
}
