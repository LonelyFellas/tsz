import Link from "@mui/icons-material/Link";
import { Box, Button, Popover, Typography } from "@mui/material";
import { useState } from "react";
import { nodesReferenceCount, referencesForNodes } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { V3ReferenceList } from "./V3ReferenceList";
import "./V3ReferenceBadge.css";

export function V3ReferenceBadge({
  nodeIds,
  label
}: {
  nodeIds: readonly string[];
  label?: string;
}) {
  const { index } = useV3ReferenceGuard();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const count = nodesReferenceCount(index, nodeIds);
  if (!count) return null;
  const references = referencesForNodes(index, nodeIds);
  return (
    <>
      <Button
        variant="outlined"
        color="warning"
        aria-label={`查看 ${count} 处关联`}
        className="v3-reference-badge"
        title={`存在 ${count} 处关联，点击查看关联内容`}
        sx={{ minWidth: 0, py: 0, bgcolor: "#fff7e6" }}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
      >
        <Link sx={{ fontSize: 14, mr: 0.5 }} />
        {count}
      </Button>
      <Popover
        open={!!anchor && anchor.isConnected}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        onClick={(event) => event.stopPropagation()}
      >
        <Box role="dialog" aria-label="关联内容" sx={{ p: 2, maxWidth: 560 }}>
          <Typography fontWeight={600} sx={{ mb: 1 }}>
            {label || "此内容"}存在 {count} 处关联
          </Typography>
          <V3ReferenceList references={references} total={count} />
        </Box>
      </Popover>
    </>
  );
}
