import { Alert as MuiAlert, AlertTitle as MuiAlertTitle } from "@mui/material";

export type CreationSource = "dictionary" | "dictionary-empty" | "blank";

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
      <MuiAlert severity={"success"}>
        <MuiAlertTitle>{"已根据内置词典预填，请核对"}</MuiAlertTitle>
        {"词性、词形和发音以当前草稿内容为准，可继续完善后保存。"}
      </MuiAlert>
    );
  }
  return source === "dictionary-empty" ? (
    <MuiAlert severity={"warning"}>
      <MuiAlertTitle>{"词性建议尚未写入，请手动补充"}</MuiAlertTitle>
      {
        "当前草稿没有词性或词形，请使用“添加词性”入口；系统未复制重复词条的既有内容。"
      }
    </MuiAlert>
  ) : (
    <MuiAlert severity={"info"}>
      <MuiAlertTitle>{"未找到内置词典建议，已创建空白草稿"}</MuiAlertTitle>
      {"请在后续步骤补充词性、词形和发音。"}
    </MuiAlert>
  );
}
