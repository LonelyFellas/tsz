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
      eyebrow={uiText("webTask:teaching_workspace")}
      title={uiText("webTask:task_management")}
      icon={ClipboardList}
      heading={uiText("webTask:teacher_assigned_tasks_are_not_available_yet")}
      links={[
        {
          href: "/account/wordlists",
          label: uiText("webTask:organise_my_word_lists")
        },
        {
          href: "/wordlists",
          label: uiText("webTask:browse_word_list_library")
        }
      ]}
    >
      {uiText(
        "webTask:students_can_create_personal_tasks_in_my_learning_tasks"
      )}
    </ComingSoon>
  );
}
