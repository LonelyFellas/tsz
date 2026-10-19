import { Users } from "lucide-react";
import { ComingSoon } from "@/features/shell/ComingSoon";

// 班级管理:添加词表 → 系统生成班级长期任务。
export function ClassManager() {
  return (
    <ComingSoon
      eyebrow="教学工作台"
      title="班级管理"
      icon={Users}
      heading="班级功能即将开放"
      links={[
        { href: "/account/wordlists", label: "整理我的词表" },
        { href: "/wordlists", label: "浏览词库广场" }
      ]}
    >
      开放后可以创建班级、管理成员，并把词表添加为班级的长期任务。现在可以先整理好要用的词表。
    </ComingSoon>
  );
}
