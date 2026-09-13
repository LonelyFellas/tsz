import { Popover, Typography } from "antd";
import { useState } from "react";

/**
 * 列表里的英文全称最长 200 字：最多显示两行，放不下时以省略号收尾，悬停用 Popover 看全文。
 * 没被截断时不给 Popover 内容，短名称悬停不会弹出一模一样的文字。
 */
export function FullNameEnCell({ value }: { value: string }) {
  const [truncated, setTruncated] = useState(false);
  return (
    <Popover
      content={
        truncated ? (
          <div style={{ maxWidth: 360, overflowWrap: "anywhere" }}>{value}</div>
        ) : null
      }
    >
      <Typography.Paragraph
        style={{ margin: 0, overflowWrap: "anywhere" }}
        ellipsis={{ rows: 2, onEllipsis: setTruncated }}
      >
        {value}
      </Typography.Paragraph>
    </Popover>
  );
}
