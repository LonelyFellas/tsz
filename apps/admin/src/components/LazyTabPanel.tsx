import { Box } from "@mui/material";
import { useState } from "react";
import type { ReactNode } from "react";

/** 首次选中时挂载，切换后保留字段与编辑器状态。 */
export function LazyTabPanel({
  active,
  id,
  labelledBy,
  children
}: {
  active: boolean;
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return visited ? (
    <Box
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      hidden={!active}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </Box>
  ) : null;
}
