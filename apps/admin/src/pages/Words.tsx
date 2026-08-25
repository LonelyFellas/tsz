import { SmartDictionary } from "@/features/dictionary/SmartDictionary";
import { reportUnknownPresentationStrategy } from "@/features/dictionary/presentation";

// 词库管理 → 智能词库：真实 data source；Mock 仅用于显式测试环境。
export function WordsPage() {
  return (
    <SmartDictionary
      reportUnknownPresentationStrategy={reportUnknownPresentationStrategy}
    />
  );
}
