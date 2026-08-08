import { WordCreationWizard } from "@/features/dictionary/word-creation/WordCreationWizard";

// 智能词库 → 创建单词：检测通过前没有 wordId，由向导负责第 1 步状态。
export function WordCreatePage() {
  return <WordCreationWizard mode="create" />;
}
