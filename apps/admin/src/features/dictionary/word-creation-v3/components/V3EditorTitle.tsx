import { Flex, Typography } from "antd";
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
    <Flex className="v3-editor-title" align="center" gap={8} wrap>
      {index !== undefined && <V3RowIndex index={index} />}
      <span>{title}</span>
      <Typography.Text
        type="secondary"
        style={{ fontSize: 14, fontWeight: 400 }}
      >
        · {details}
      </Typography.Text>
    </Flex>
  );
}
