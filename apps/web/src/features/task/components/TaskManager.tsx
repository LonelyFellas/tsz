import { ClipboardList } from "lucide-react";
import { ComingSoon } from "@/features/shell/ComingSoon";

// 教师任务与班级尚未开放。
export function TaskManager() {
  return (
    <ComingSoon
      eyebrow="教学工作台"
      title="任务管理"
      icon={ClipboardList}
      heading="教师布置任务暂未开放"
      links={[
        { href: "/account/wordlists", label: "整理我的词表" },
        { href: "/wordlists", label: "浏览词库广场" }
      ]}
    >
      学生可在“我的学习任务”中创建个人任务。
    </ComingSoon>
  );
}
