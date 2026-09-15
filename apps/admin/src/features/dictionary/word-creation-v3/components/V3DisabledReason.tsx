import { Tooltip } from "antd";
import type { ReactNode } from "react";
import "./V3DisabledReason.css";

/**
 * 禁用控件的原因提示。原生 title 要停一两秒才出、样式也和 antd 对不上；禁用的按钮与单选
 * 不派发鼠标事件，Tooltip 直接挂在控件上不会弹，所以挂在外层 span，控件本身让出指针事件。
 * 没有原因时原样渲染，不多包一层。
 */
export function V3DisabledReason({
  reason,
  block = false,
  children
}: {
  reason?: string;
  /** 占满整行的控件（如词形类型下拉）用块级外层，免得被收窄。 */
  block?: boolean;
  children: ReactNode;
}) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip title={reason}>
      <span
        className={
          block
            ? "v3-disabled-reason v3-disabled-reason-block"
            : "v3-disabled-reason"
        }
        // 里面的控件是禁用的，点在上面不该冒泡去切页签、折叠卡片。
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </span>
    </Tooltip>
  );
}
