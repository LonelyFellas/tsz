import { createContext, useContext } from "react";
import type { VoiceRecommendationArea } from "@tsz/voice-editor/types";

/** 只承接已有业务保存；编辑结果由各宿主一次合并到当前草稿。 */
export const VoiceSaveContext = createContext<{
  save: (area?: VoiceRecommendationArea) => Promise<boolean>;
  /** 折叠字段的正式音频生成；业务保存先等待资产回写，再读取当前草稿。 */
  audioTasks?: Map<string, () => Promise<boolean>>;
} | null>(null);
export const useVoiceSave = () => useContext(VoiceSaveContext);
