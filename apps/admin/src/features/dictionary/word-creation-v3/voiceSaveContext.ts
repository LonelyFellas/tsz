import { createContext, useContext } from "react";
import type { VoiceRecommendationArea } from "@tsz/voice-editor/types";

/** 只承接已有业务保存；编辑结果由各宿主一次合并到当前草稿。 */
export const VoiceSaveContext = createContext<{
  save: (
    area?: VoiceRecommendationArea,
    options?: VoiceSaveOptions
  ) => Promise<boolean>;
  failure?: string;
  /** 折叠字段的正式音频生成；业务保存先等待资产回写，再读取当前草稿。 */
  audioTasks?: Map<string, () => Promise<boolean>>;
} | null>(null);
export const useVoiceSave = () => useContext(VoiceSaveContext);

export interface VoiceSaveOptions {
  /** 实际发音只改展示标注，不应被无关的正式音频任务阻断。 */
  skipAudioTasks?: boolean;
  /** 内容弹窗内的局部保存可以绕过离开保护，但仍按 skipAudioTasks 决定是否等待音频。 */
  allowContentSave?: boolean;
}

/** 内容弹窗有独立草稿，即使没有业务保存动作也需要等待其音频。 */
export const VoiceAudioTasksContext = createContext<Map<
  string,
  () => Promise<boolean>
> | null>(null);
export function useVoiceAudioTasks() {
  const scoped = useContext(VoiceAudioTasksContext);
  const save = useVoiceSave();
  return scoped ?? save?.audioTasks;
}
