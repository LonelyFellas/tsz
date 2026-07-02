import { WordEditor } from "@/features/dictionary/WordEditor";

// 词库管理 → 智能词库 → 词条编辑：整页富表单，按路由 :wordId 加载/保存整棵词条树。
export function WordEditPage() {
  return <WordEditor />;
}
