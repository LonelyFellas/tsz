import { Alert } from "antd";

export type CreationSource = "dictionary" | "blank";

export interface CreationNavigationState {
  creationSource: CreationSource;
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
  return source === "dictionary" || source === "blank" ? source : undefined;
}

export function CreationSourceNotice({ source }: { source?: CreationSource }) {
  if (!source) return null;
  return source === "dictionary" ? (
    <Alert
      showIcon
      type="success"
      title="已根据内置词典预填，请核对"
      description="词性、词形和发音以当前草稿内容为准，可继续完善后保存。"
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
