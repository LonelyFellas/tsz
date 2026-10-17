import InboxOutlined from "@mui/icons-material/InboxOutlined";
import { Typography } from "@mui/material";
import type { ReactNode } from "react";
import "./EmptyState.css";

export function EmptyStateHint({ children }: { children: ReactNode }) {
  return (
    <div className="admin-empty-state-hint">
      <InboxOutlined aria-hidden="true" />
      <Typography component="span">{children}</Typography>
    </div>
  );
}
