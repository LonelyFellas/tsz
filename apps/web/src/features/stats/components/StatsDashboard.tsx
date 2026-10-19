import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/features/shell/ComingSoon";

// 数据统计:学生完成率、打卡情况、词表使用等汇总。
export function StatsDashboard() {
  return (
    <ComingSoon
      eyebrow="教学工作台"
      title="数据统计"
      icon={BarChart3}
      heading="学习数据即将开放"
      links={[{ href: "/account/wordlists", label: "整理我的词表" }]}
    >
      开放后可以查看学生的完成率、打卡情况和词表使用汇总。
    </ComingSoon>
  );
}
