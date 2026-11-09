"use client";

import { useWebText } from "@/i18n/client";
import { webClass } from "@/i18n/messages/class";
import { Users } from "lucide-react";
import { ComingSoon } from "@/features/shell/ComingSoon";

// 班级管理:添加词表 → 系统生成班级长期任务。
export function ClassManager() {
  const uiText = useWebText(webClass);
  return (
    <ComingSoon
      eyebrow={uiText("webClass:teaching_workspace")}
      title={uiText("webClass:class_management")}
      icon={Users}
      heading={uiText("webClass:classes_are_not_available_yet")}
      links={[
        {
          href: "/account/wordlists",
          label: uiText("webClass:organise_my_word_lists")
        },
        {
          href: "/wordlists",
          label: uiText("webClass:browse_word_list_library")
        }
      ]}
    >
      {uiText(
        "webClass:when_available_you_will_be_able_to_create_classes_manage_members_and_add"
      )}
    </ComingSoon>
  );
}
