"use client";

import { useWebText } from "@/i18n/client";
import { webStats } from "@/i18n/messages/stats";
import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/features/shell/ComingSoon";

// 数据统计:学生完成率、打卡情况、词表使用等汇总。
export function StatsDashboard() {
  const uiText = useWebText(webStats);
  return (
    <ComingSoon
      eyebrow={uiText("webStats:teaching_workspace")}
      title={uiText("webStats:learning_statistics")}
      icon={BarChart3}
      heading={uiText("webStats:learning_data_are_not_available_yet")}
      links={[
        {
          href: "/account/wordlists",
          label: uiText("webStats:organise_my_word_lists")
        }
      ]}
    >
      {uiText(
        "webStats:when_available_you_will_be_able_to_view_student_completion_rates_check_i"
      )}
    </ComingSoon>
  );
}
