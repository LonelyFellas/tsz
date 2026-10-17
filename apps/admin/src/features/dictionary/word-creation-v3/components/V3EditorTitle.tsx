import { Stack as MuiStack, Typography as MuiTypography } from "@mui/material";

import { V3RowIndex } from "./V3RowIndex";

/** 富文本弹窗共用标题层级；没有列表序号的入口不虚构序号。 */
export function V3EditorTitle({
  index,
  title,
  details
}: {
  index?: number;
  title: string;
  details: string;
}) {
  return (
    <MuiStack
      className="v3-editor-title"
      direction="row"
      spacing={1}
      alignItems={"center"}
      useFlexGap
      flexWrap="wrap"
    >
      {index !== undefined && <V3RowIndex index={index} />}
      <span>{title}</span>
      <MuiTypography
        style={{ fontSize: 14, fontWeight: 400 }}
        component="span"
        color="text.secondary"
      >
        · {details}
      </MuiTypography>
    </MuiStack>
  );
}
