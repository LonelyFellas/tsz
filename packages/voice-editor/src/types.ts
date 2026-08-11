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
  ssml: string;
  dispose?: () => void;
}

export type VoicePreviewErrorCode =
  | "invalid_content"
  | "voice_not_found"
  | "option_not_supported"
  | "rate_limited"
  | "quota_exceeded"
  | "unavailable"
  | "unknown";

export class VoicePreviewError extends Error {
  constructor(
    public readonly code: VoicePreviewErrorCode,
    message: string
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

export interface VoiceRichTextEditorProps {
  open: boolean;
  value: RichText;
  language?: string;
  contextLabel?: string;
  pronunciationHints?: Readonly<Record<string, string>>;
  previewAdapter?: VoicePreviewAdapter;
  readOnly?: boolean;
  onApply: (value: RichTextV2) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  confirmDiscard?: () => boolean | Promise<boolean>;
}
