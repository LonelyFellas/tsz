import { WordCreationWizard } from "@/features/dictionary/word-creation/WordCreationWizard";

// V2 草稿恢复及已发布只读预览入口；向导自行读取 :wordId / :step 并做路由守卫。
export function WordWizardPage() {
  return <WordCreationWizard mode="resume" />;
}
