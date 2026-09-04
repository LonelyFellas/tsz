import type { RichText, RichTextV2 } from "@tsz/types";

export interface VoiceOption {
  id: string;
  label: string;
  locale: string;
  gender: "female" | "male" | "neutral";
  styles: string[];
  supportsRate: boolean;
  supportsPitch: boolean;
  isDefault: boolean;
  rateRange?: { min: number; max: number };
  pitchRange?: { min: number; max: number };
}

export interface VoiceSettings {
  voiceId: string;
  style?: string;
  ratePercent?: number;
  pitchSemitones?: number;
}

export interface VoicePreviewRequest extends VoiceSettings {
  language: string;
  content: RichTextV2;
}

export interface VoicePreviewResult {
  audioUrl: string;
  expiresAt: string;
  cached: boolean;
  dispose?: () => void;
}

export type VoicePreviewErrorCode =
  | "invalid_content"
  | "voice_not_found"
  | "preview_in_progress"
  | "option_not_supported"
  | "rate_limited"
  | "quota_exceeded"
  | "unavailable"
  | "unknown";

export class VoicePreviewError extends Error {
  constructor(
    public readonly code: VoicePreviewErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "VoicePreviewError";
  }
}

export interface VoicePreviewAdapter {
  listVoices(input: {
    language: string;
    signal?: AbortSignal;
  }): Promise<VoiceOption[]>;
  synthesize(
    input: VoicePreviewRequest,
    options?: { signal?: AbortSignal }
  ): Promise<VoicePreviewResult>;
}

export interface VoiceRichTextFieldProps {
  value: RichText;
  contextLabel?: string;
  dialectLabel?: string;
  readOnly?: boolean;
  onEdit?: () => void;
}

/**
 * 编辑器是**受控内联**组件：直接落在表单里，改动实时抛给宿主，没有「应用/取消」。
 *
 * 早期版本是抽屉 + 应用/取消，标注要先开一层浮层才看得见。既然标注本身就是在
 * 正文上点，把它和正文分到两个层面反而多一次往返；内联后所见即所改。
 */
export interface VoiceEditorProps {
  value: RichText;
  language?: string;
  /** 无障碍名，同时用于区分同一页面上的多个编辑器。 */
  contextLabel?: string;
  previewAdapter?: VoicePreviewAdapter;
  /**
   * previewAdapter 是否是「假」适配器(不发请求、返回假音频)。宿主自己判断并告知，
   * 本包不读任何环境变量，保持对宿主环境无感。为 true 时编辑器内会标出「模拟」。
   */
  previewIsMock?: boolean;
  readOnly?: boolean;
  /**
   * 透传到正文输入框上的 data-* 属性。宿主（admin）用它做错误定位：拿
   * `[data-v3-node-id][data-v3-field]` 找到元素后要 `focus()` 并校验
   * `activeElement`，所以这些属性必须落在真正可聚焦的输入框上，挂在外层容器无效。
   */
  inputDataAttributes?: Record<string, string>;
  /** 正文输入框的占位提示；宿主的字段专属提示比通用那句有用，故可覆盖。 */
  placeholder?: string;
  onChange: (value: RichTextV2) => void;
}
