import { StatCard, type StatItem } from "@/features/dashboard/StatCard";

// 看板数据当前为占位，待 /admin 统计接口落地后改为服务端拉取。
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

export default function AdminHome() {
  return (
    <div>
      <h1 className="sr-only">首页数据</h1>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StatCard title="用户数据" items={USER_STATS} />
        <StatCard title="任务数据" items={TASK_STATS} />
        <StatCard title="智能词库" items={WORDBANK_STATS} />
        <StatCard
          title="天生币"
          items={COIN_STATS}
          action={
            <div className="flex items-center gap-4 text-sm">
              <button className="font-medium text-blue-600 hover:text-blue-700">
                发放
              </button>
              <button className="text-gray-400 hover:text-gray-600">
                扣除
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}
