import { ThunderboltFilled } from "@ant-design/icons";
import { Flex, Tooltip, Typography } from "antd";
import type { ReactNode } from "react";

const { Title } = Typography;

// —— 小节标题：左侧标题 + 可选 AI 生成标记（闪电图标表示该区块支持 AI 智能生成）。——
export function SectionTitle({
  children,
  ai
}: {
  children: ReactNode;
  ai?: boolean;
}) {
  return (
    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
      <Title level={5} style={{ margin: 0 }}>
        {children}
      </Title>
      {ai && (
        <Tooltip title="AI 智能生成">
          <ThunderboltFilled style={{ color: "#0071e3" }} />
        </Tooltip>
      )}
    </Flex>
  );
}
