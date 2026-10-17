import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
export function PageStatus({
  title,
  description,
  action
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack spacing={2} alignItems="center" sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h4">{title}</Typography>
      {description && (
        <Typography color="text.secondary">{description}</Typography>
      )}
      {action}
    </Stack>
  );
}
