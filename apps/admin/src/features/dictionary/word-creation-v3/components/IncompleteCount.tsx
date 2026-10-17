import { Box } from "@mui/material";
export function IncompleteCount({
  count,
  title
}: {
  count: number;
  title?: string;
}) {
  return count > 0 ? (
    <Box
      component="span"
      title={title}
      sx={{
        display: "inline-block",
        minWidth: 18,
        px: 0.5,
        lineHeight: "18px",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 9,
        bgcolor: "error.main",
        color: "#fff",
        textAlign: "center"
      }}
    >
      {count > 99 ? "99+" : count}
    </Box>
  ) : null;
}
