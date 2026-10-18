// 可复制文本：列表单元格 / 详情项通用的「一键复制 + 可选单行截断 + 空值占位」。
// 抽出以收敛 tooltips 文案与「有值则展示可复制、否则占位」的重复（列表列与详情抽屉共 6 处）。
import { Typography } from "antd";

interface Props {
  /** 要展示并复制的文本；空 / 未定义时渲染占位。 */
  value?: string | null;
  /**
   * 单行截断并悬浮显示全文。传 number 时同时限制最大宽度（像素，超出才截断）；
   * 传 true 仅开启截断不限宽；缺省不截断。
   */
  ellipsis?: boolean | number;
  /** 空值占位，默认「-」。 */
  placeholder?: string;
}

// 复制按钮的悬浮提示（复制前 / 复制后），集中一处避免各调用点各写一遍。
const COPY_TOOLTIPS: [string, string] = ["复制", "已复制"];

export function CopyableText({ value, ellipsis, placeholder = "-" }: Props) {
  if (!value) return <>{placeholder}</>;
  const maxWidth = typeof ellipsis === "number" ? ellipsis : undefined;
  return (
    <Typography.Text
      ellipsis={ellipsis ? { tooltip: value } : undefined}
      copyable={{ text: value, tooltips: COPY_TOOLTIPS }}
      style={maxWidth ? { maxWidth } : undefined}
    >
      {value}
    </Typography.Text>
  );
}
