import { Card, Flex, Statistic, Typography } from "antd";
import type { ReactNode } from "react";

export interface StatItem {
  label: string;
  value: string;
}

interface StatCardProps {
  title: string;
  items: StatItem[];
  /** 卡片标题右侧的操作位（如天生币的「发放 / 扣除」）。 */
  action?: ReactNode;
}

/**
 * 首页数据看板的统计卡：标题行 + 一排指标（antd Statistic：灰标签在上、大数值在下）。
 * 数值目前为占位，后续接 /admin 统计接口后由父级传入。
 * Card 的 title 只是普通 div，包一层 Typography.Title 保住 heading 语义。
 */
export function StatCard({ title, items, action }: StatCardProps) {
  return (
    <Card
      title={
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
      }
      extra={action}
    >
      <Flex justify="space-between" gap={16} wrap>
        {items.map((item) => (
          <Statistic key={item.label} title={item.label} value={item.value} />
        ))}
      </Flex>
    </Card>
  );
}
