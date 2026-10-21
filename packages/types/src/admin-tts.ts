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
  display_name: string;
  is_common: boolean;
  locale: string;
  gender: string;
  capabilities: AdminSpeechVoiceCapabilities;
}

export interface AdminDubbingRecommendation {
  id: string;
  name: string;
  voice_alias: string;
  parameters: AdminVoiceParameters;
}

export interface AdminDubbingGroup {
  id: string;
  name: string;
  areas: string[];
  uk: AdminDubbingRecommendation[];
  us: AdminDubbingRecommendation[];
}

export interface AdminDubbingGroupsResponse {
  groups: AdminDubbingGroup[];
  revision: number;
}

export interface SaveAdminDubbingGroupsInput {
  groups: AdminDubbingGroup[];
  base_revision: number;
}

export interface AdminVoiceParameters {
  rate_percent: number;
  pitch_semitones: number;
  style: string | null;
}

export interface AdminVoiceLibraryItem {
  voice_alias: string;
  description_zh: string | null;
  description_revision: number;
  parameters: AdminVoiceParameters | null;
  notes: string;
  personal_revision: number;
}

export interface AdminVoiceLibraryResponse {
  items: AdminVoiceLibraryItem[];
}

export interface SaveAdminVoiceSettingsInput {
  parameters: AdminVoiceParameters | null;
  notes: string;
  base_revision: number;
}

export interface SaveAdminVoiceDescriptionInput {
  description_zh: string;
  base_revision: number;
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
