"use client";

import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";
import { ClipboardList } from "lucide-react";
import { ComingSoon } from "@/features/shell/ComingSoon";

// 教师任务与班级尚未开放。
export function TaskManager() {
  const uiText = useWebText(webTask);
  return (
    <ComingSoon
      eyebrow={uiText("教学工作台")}
      title={uiText("任务管理")}
      icon={ClipboardList}
      heading={uiText("教师布置任务暂未开放")}
      links={[
        { href: "/account/wordlists", label: uiText("整理我的词表") },
        { href: "/wordlists", label: uiText("浏览词库广场") }
      ]}
    >
      {uiText("学生可在“我的学习任务”中创建个人任务。")}
    </ComingSoon>
  );
}
