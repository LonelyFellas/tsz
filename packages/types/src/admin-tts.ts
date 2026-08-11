import type { RichTextV2 } from "./rich-text";

export interface AdminTtsVoice {
  id: string;
  label: string;
  locale: string;
  gender: "female" | "male" | "neutral";
  styles: string[];
  supports_rate: boolean;
  supports_pitch: boolean;
  is_default: boolean;
}

export interface AdminTtsVoiceListResponse {
  items: AdminTtsVoice[];
}

export interface CreateAdminTtsPreviewInput {
  language: "en";
  content: RichTextV2;
  voice_id: string;
  style?: string;
  rate_percent?: number;
  pitch_semitones?: number;
}

export interface AdminTtsPreviewResponse {
  audio_url: string;
  expires_at: string;
  cached: boolean;
  ssml: string;
}
