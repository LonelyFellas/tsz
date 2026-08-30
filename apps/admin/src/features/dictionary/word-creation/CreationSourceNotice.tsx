import { Alert } from "antd";
import type { PendingSentenceTargetNavigation } from "../word-creation-v3/pendingSentenceTargetNavigation";

export type CreationSource = "dictionary" | "dictionary-empty" | "blank";

export interface CreationNavigationState {
  creationSource: CreationSource;
  pendingSentenceTarget?: PendingSentenceTargetNavigation;
}

export function creationSourceFromState(
  state: unknown
): CreationSource | undefined {
  if (
    typeof state !== "object" ||
    state === null ||
    !("creationSource" in state)
  ) {
    return undefined;
  }
  const source = state.creationSource;
  return source === "dictionary" ||
    source === "dictionary-empty" ||
    source === "blank"
    ? source
    : undefined;
}

export function CreationSourceNotice({ source }: { source?: CreationSource }) {
  if (!source) return null;
  if (source === "dictionary") {
    return (
      <Alert
        showIcon
        type="success"
        title="已根据内置词典预填，请核对"
        description="词性、词形和发音以当前草稿内容为准，可继续完善后保存。"
      />
    );
  }
  return source === "dictionary-empty" ? (
    <Alert
      showIcon
      type="warning"
      title="词性建议尚未写入，请手动补充"
      description="当前草稿没有词性或词形，请从右上角添加词性；系统未复制重复词条的既有内容。"
    />
  ) : (
    <Alert
      showIcon
      type="info"
      title="未找到内置词典建议，已创建空白草稿"
      description="请在后续步骤补充词性、词形和发音。"
    />
  );
}
