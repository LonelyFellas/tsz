import type { RichTextV2 } from "./rich-text";

export interface AdminSpeechVoiceCapabilities {
  styles: string[];
  min_rate_percent: number;
  max_rate_percent: number;
  min_pitch_semitones: number;
  max_pitch_semitones: number;
}

export interface AdminSpeechVoice {
  alias: string;
  locale: string;
  gender: string;
  capabilities: AdminSpeechVoiceCapabilities;
}

export interface AdminSpeechVoiceListResponse {
  items: AdminSpeechVoice[];
}

export interface CreateAdminSpeechPreviewInput {
  content: RichTextV2;
  voice_alias: string;
  style?: string | null;
  rate_percent?: number;
  pitch_semitones?: number;
}

export interface AdminSpeechPreviewResponse {
  cache_status: "hit" | "generated";
  audio_url: string;
  expires_at: string;
  url_expires_in_seconds: number;
}
