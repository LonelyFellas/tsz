// 可复制文本：列表单元格 / 详情项通用的「一键复制 + 可选单行截断 + 空值占位」。
// 抽出以收敛 tooltips 文案与「有值则展示可复制、否则占位」的重复（列表列与详情抽屉共 6 处）。
import { Box, IconButton, Tooltip } from "@mui/material";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Check from "@mui/icons-material/Check";
import { useState } from "react";

export function CopyableText({
  value,
  ellipsis,
  placeholder = "-"
}: {
  value?: string | null;
  ellipsis?: boolean | number;
  placeholder?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!value) return <>{placeholder}</>;
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", maxWidth: "100%" }}
    >
      <Tooltip describeChild title={ellipsis ? value : ""}>
        <Box
          component="span"
          style={{
            maxWidth: typeof ellipsis === "number" ? ellipsis : undefined
          }}
          sx={
            ellipsis
              ? {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }
              : undefined
          }
        >
          {value}
        </Box>
      </Tooltip>
      <Tooltip
        describeChild
        title={failed ? "复制失败，请手动复制" : copied ? "已复制" : "复制"}
      >
        <IconButton
          size="small"
          aria-label={copied ? "已复制" : "复制"}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true);
                setFailed(false);
              })
              .catch(() => setFailed(true));
          }}
        >
          {copied ? (
            <Check fontSize="inherit" />
          ) : (
            <ContentCopy fontSize="inherit" />
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
