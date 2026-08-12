import { WordEditor } from "@/features/dictionary/WordEditor";
import { adminWordsDataSourceCapabilities } from "@/features/dictionary/dataSource";
import { Navigate } from "react-router-dom";

// 词库管理 → 智能词库 → 词条编辑：整页富表单，按路由 :wordId 加载/保存整棵词条树。
export function WordEditPage() {
  if (!adminWordsDataSourceCapabilities.legacyEntryCreation) {
    return <Navigate to="/words" replace />;
  }
  return <WordEditor />;
}
