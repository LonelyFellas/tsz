import { LinkOutlined } from "@ant-design/icons";
import { Popover, Tag } from "antd";
import { nodesReferenceCount, referencesForNodes } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { V3ReferenceList } from "./V3ReferenceList";
import "./V3ReferenceBadge.css";

/**
 * 引用徽标（链接图标 + 计数，不写文案；含义交给悬停说明与可及名「查看 N 处关联」）：点开列出指向这批节点的引用并可跳转。禁用按钮上的悬停在 antd 里
 * 不可靠，列表入口一律放在徽标上；没有引用时不渲染。
 */
export function V3ReferenceBadge({
  nodeIds,
  label
}: {
  nodeIds: readonly string[];
  /** 悬停说明里的节点名，如「词形」「词义」。 */
  label?: string;
}) {
  const { index } = useV3ReferenceGuard();
  const count = nodesReferenceCount(index, nodeIds);
  if (count === 0) return null;
  const references = referencesForNodes(index, nodeIds);
  return (
    <Popover
      content={<V3ReferenceList references={references} total={count} />}
      overlayStyle={{ maxWidth: 560 }}
      title={`${label || "此内容"}存在 ${count} 处关联`}
      trigger="click"
    >
      <Tag
        aria-label={`查看 ${count} 处关联`}
        className="v3-reference-badge"
        color="orange"
        onClick={(event) => event.stopPropagation()}
        role="button"
        style={{ cursor: "pointer", marginInlineEnd: 0 }}
        tabIndex={0}
        title={`存在 ${count} 处关联，点击查看关联内容`}
      >
        {/* 不走 Tag 的 icon 插槽：页签会给内部图标加 12px 右边距、Tag 再给文字加 7px，图标和计数之间空出一大截。行内样式压过这两条。 */}
        <LinkOutlined style={{ marginInlineEnd: 4 }} />
        {count}
      </Tag>
    </Popover>
  );
}
