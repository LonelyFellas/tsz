// 带「置灰原因」悬浮提示的按钮：把 <Tooltip title={disabled?reason:""}><Button disabled/></Tooltip>
// 这一在多处行操作（管理员启禁用/重置、用户编辑/启禁用）重复的门禁壳收敛为一处，
// 避免「加了 disabled 却忘了配 Tooltip 说明为什么点不了」的分叉。透传其余 Button 属性
//（variant/size/loading/color/startIcon/onClick/children 等），行为与手写包裹完全一致。
import { Button, Tooltip } from "@mui/material";
import type { ButtonProps } from "@mui/material";

interface Props extends ButtonProps {
  /** 置灰原因：disabled 时作为悬浮提示展示；enabled 时不显示提示。 */
  reason?: string;
}

export function GatedButton({ reason, disabled, ...rest }: Props) {
  return (
    <Tooltip describeChild title={disabled ? (reason ?? "") : ""}>
      <span style={{ display: "inline-flex" }}>
        <Button disabled={disabled} {...rest} />
      </span>
    </Tooltip>
  );
}
