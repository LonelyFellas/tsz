import { Button, Col, Row, Space } from "antd";
import type { ReactNode } from "react";
import { StatCard, type StatItem } from "@/features/dashboard/StatCard";

// 看板数据当前为占位，待 /admin 统计接口落地后接 TanStack Query 拉取。
const USER_STATS: StatItem[] = [
  { label: "累计", value: "12335" },
  { label: "今日", value: "234" },
  { label: "近三日", value: "25" },
  { label: "近7日", value: "10" }
];

const TASK_STATS: StatItem[] = [
  { label: "累计数量", value: "231" },
  { label: "今日", value: "3" },
  { label: "本周", value: "25" },
  { label: "学习进度", value: "34%" }
];

const WORDBANK_STATS: StatItem[] = [
  { label: "累计创建", value: "233" },
  { label: "今日创建", value: "23" },
  { label: "本周创建", value: "55" },
  { label: "本月创建", value: "100" }
];

const COIN_STATS: StatItem[] = [
  { label: "累计", value: "2313" },
  { label: "今日", value: "23" },
  { label: "本周", value: "55" },
  { label: "本月", value: "100" }
];

interface DashboardCard {
  title: string;
  items: StatItem[];
  action?: ReactNode;
}

const CARDS: DashboardCard[] = [
  { title: "用户数据", items: USER_STATS },
  { title: "任务数据", items: TASK_STATS },
  { title: "智能词库", items: WORDBANK_STATS },
  {
    title: "天生币",
    items: COIN_STATS,
    action: (
      <Space>
        <Button type="link" size="small" style={{ padding: 0 }}>
          发放
        </Button>
        <Button type="link" size="small" style={{ padding: 0 }}>
          扣除
        </Button>
      </Space>
    )
  }
];

export function HomePage() {
  return (
    <div>
      <h1 className="sr-only">首页数据</h1>
      <Row gutter={[20, 20]}>
        {CARDS.map(({ title, items, action }) => (
          <Col key={title} xs={24} lg={12}>
            <StatCard title={title} items={items} action={action} />
          </Col>
        ))}
      </Row>
    </div>
  );
}
