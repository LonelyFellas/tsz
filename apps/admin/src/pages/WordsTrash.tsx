import { SmartDictionary } from "@/features/dictionary/SmartDictionary";
import { reportUnknownPresentationStrategy } from "@/features/dictionary/presentation";

// 词库管理 → 垃圾桶：与智能词库共用列表与生命周期逻辑，固定只看归档词条。
// 独立入口的意义是把「清理」与「创编」分成两个任务语境，避免在全量列表里误操作。
export function WordsTrashPage() {
  return (
    <SmartDictionary
      mode="trash"
      reportUnknownPresentationStrategy={reportUnknownPresentationStrategy}
    />
  );
}
