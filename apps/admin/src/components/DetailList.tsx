import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
export function DetailList({
  items
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {items.map((item) => (
        <Box
          key={item.label}
          sx={{
            display: "grid",
            gridTemplateColumns: "100px minmax(0,1fr)",
            py: 1,
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <Typography component="dt" color="text.secondary">
            {item.label}
          </Typography>
          <Box
            component="dd"
            sx={{ m: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
          >
            {item.value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
