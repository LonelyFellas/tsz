import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { Card, Statistic, Typography } from "antd";
import type { KpiItem } from "./mockData";

interface KpiCardProps {
  item: KpiItem;
}

/**
 * 顶部 KPI 指标卡：一眼看「现在怎么样」。
 * 主数值（antd Statistic，自带千分位）+ 环比趋势行（涨绿/跌红）+ 次要口径 hint。
 * 数值目前为 mock，后续接 /admin 统计接口后由父级传入。
 */
export function KpiCard({ item }: KpiCardProps) {
  const { label, value, suffix, delta, hint } = item;

  return (
    <Card size="small" style={{ height: "100%" }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {label}
      </Typography.Text>
      <Statistic
        value={value}
        suffix={suffix}
        styles={{ content: { fontSize: 26, fontWeight: 600, lineHeight: 1.3 } }}
      />
      {/* 零增量视为持平：不渲染趋势行（与 KpiItem 契约一致）。仅正/负才出涨跌行。 */}
      {delta && delta.value !== 0 && (
        <Typography.Text
          style={{
            fontSize: 12,
            color: delta.value > 0 ? "#52c41a" : "#ff4d4f"
          }}
        >
          {delta.value > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{" "}
          {delta.label} {delta.value > 0 ? "+" : ""}
          {delta.value.toLocaleString()}
        </Typography.Text>
      )}
      {hint && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {hint}
          </Typography.Text>
        </div>
      )}
    </Card>
  );
}
