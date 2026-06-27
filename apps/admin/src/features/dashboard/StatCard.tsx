import type { ReactNode } from "react";
import { Card } from "@tsz/ui";

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
 * 首页数据看板的统计卡：标题行 + 一排「大数值 / 灰标签」指标。
 * 数值目前为占位，后续接 /admin 统计接口后由父级传入。
 */
export function StatCard({ title, items, action }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-500">{title}</h2>
        {action}
      </div>
      <dl className="flex justify-between gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dd className="text-3xl font-bold text-gray-900">{item.value}</dd>
            <dt className="mt-2 text-sm text-gray-400">{item.label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}
