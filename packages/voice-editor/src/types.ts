import type {
  AudioAssetGenderV3,
  AudioAssetLocaleV3,
  AudioAssetV3,
  RichText,
  RichTextV2
} from "@tsz/types";
import type { SentenceSourceRangeV3, TextLinkV3 } from "@tsz/types";
import type { ReactNode } from "react";

export type VoiceAssociation = Pick<TextLinkV3, "id" | "source_segments">;

export interface AssociationPickerProps<
  TLink extends VoiceAssociation = TextLinkV3
> {
  kind: "word" | "phrase";
  segments: SentenceSourceRangeV3[];
  /** 已有关联可查看、清除或补全目标；更新时保留原标注 ID 与片段。 */
  selected?: TLink;
  onSelect: (link?: TLink) => void;
}

export interface VoiceOption {
  id: string;
  isCommon?: boolean;
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

/**
 * 一条已持久化的音频资产（真人录音）。直接用 wire 形状：与 VoiceProfile 同款，
 * 本包不另起一套命名，宿主进出都不必转换。
 */
export type AudioAsset = AudioAssetV3;
export type AudioAssetLocale = AudioAssetLocaleV3;
export type AudioAssetGender = AudioAssetGenderV3;

export type AudioUploadErrorCode =
  | "unsupported_type"
  | "too_large"
  | "too_many"
  | "storage_unavailable"
  | "upload_failed"
  | "confirm_failed"
  | "unavailable"
  | "unknown";

export class AudioUploadError extends Error {
  constructor(
    public readonly code: AudioUploadErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "AudioUploadError";
  }
}

/**
 * 音频上传适配器，由宿主注入（与 VoicePreviewAdapter 同款）：本包不碰 HTTP，
 * 「申请许可 → 直传 → confirm」三步都在适配器里完成，编辑器只看到一条资产或一个错误。
 */
export interface AudioUploadAdapter {
  upload(input: {
    file: File;
    locale: AudioAssetLocale;
    gender: AudioAssetGender;
    signal?: AbortSignal;
    /** 0..1；直传进度，申请许可与 confirm 阶段可不报。 */
    onProgress?: (ratio: number) => void;
  }): Promise<AudioAsset>;
  /** 试听用短期签名 URL；调用方在 expiresAt 前使用，过期重取。 */
  resolveUrl(
    assetId: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ url: string; expiresAt: string }>;
  /**
   * 本会话是否已探测到存储未开通（501）。由适配器记一次即可：同一页可能挂着几十个
   * 编辑器，各自记的话既重复又对不齐；编辑器每次渲染直接问。缺省视为可用。
   */
  isStorageUnavailable?(): boolean;
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
/**
 * 发音配置：启用哪几个音色、语速多少。结构与 wire 的 VoiceProfileV3 一致，
 * 但本包不依赖 admin 的词条类型，故在此另行定义。
 */
export interface VoiceSetting {
  voice_id: string;
  enabled: boolean;
  rate_percent: number;
}

export interface VoiceProfile {
  voices: VoiceSetting[];
}

export interface VoiceEditorProps<TLink extends VoiceAssociation = TextLinkV3> {
  mode?:
    | "grammar"
    | "association"
    | "pronunciation"
    | "dict-phonetic"
    | "actual-pron";
  /**
   * 这段正文所属的语种。宿主按英美分栏时传进来，音色清单和录音归属都只留这一侧；
   * 不分英美（通用栏）的字段不传，此时不做筛选。
   */
  locale?: AudioAssetLocale;
  textLinks?: TLink[];
  /** 改字失效的关联在改回原文时恢复；显式清除不自动恢复。 */
  restoreTextLinksOnCorrection?: boolean;
  renderAssociationPicker?: (props: AssociationPickerProps<TLink>) => ReactNode;
  onAssociationPendingChange?: (pending: boolean) => void;
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
  /** 正文由宿主输入框编辑；隐藏文本工具并禁止改字，仍允许标注和发音配置。 */
  textReadOnly?: boolean;
  /**
   * 透传到正文输入框上的 data-* 属性。宿主（admin）用它做错误定位：拿
   * `[data-v3-node-id][data-v3-field]` 找到元素后要 `focus()` 并校验
   * `activeElement`，所以这些属性必须落在真正可聚焦的输入框上，挂在外层容器无效。
   */
  inputDataAttributes?: Record<string, string>;
  /**
   * 发音配置。`null` / 缺省表示未配置——此时不选择任何 C 端音色，语速为原速。
   * 与正文分开走一条通道，因为它在 wire 上是正文的兄弟字段而不是正文的一部分。
   */
  voiceProfile?: VoiceProfile | null;
  onVoiceProfileChange?: (next: VoiceProfile) => void;
  /** 正文输入框的占位提示；宿主的字段专属提示比通用那句有用，故可覆盖。 */
  placeholder?: string;
  /**
   * 音频上传适配器。不传表示当前环境不支持上传：「音频」面板置灰而不是退回本地试听——
   * 两套语义并存会让人分不清哪些音频真的保存了。
   */
  audioUploadAdapter?: AudioUploadAdapter;
  /** 挂在这段文本上的音频资产；与 voiceProfile 一样是受控通道，改动实时抛出。 */
  audioAssets?: AudioAsset[];
  onAudioAssetsChange?: (next: AudioAsset[]) => void;
  /** 每段文本最多几条音频；缺省用 wire 的上限。 */
  audioAssetLimit?: number;
  onChange: (value: RichTextV2, textLinks?: TLink[]) => void;
}
