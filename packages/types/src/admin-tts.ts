import type { RichTextV2 } from "./rich-text";
import type {
  GrammarFormLinkV3,
  UpsWordV3,
  VoiceSettingV3,
  AudioAssetV3
} from "./admin-word-v3";

export type GeneratedSpeechSource =
  | { kind: "text"; content: RichTextV2; form_links?: GrammarFormLinkV3[] }
  | {
      kind: "phoneme";
      phoneme_locale?: "en-GB" | "en-US";
      content: RichTextV2;
      alphabet: "ipa" | "ups";
      phoneme: string;
      ups_words?: UpsWordV3[];
    };

export interface GenerateVoiceAudioRequest {
  request_id: string;
  source: GeneratedSpeechSource;
  setting: VoiceSettingV3;
  profile?: import("./admin-word-v3").VoiceProfileV3;
}
export interface GenerateVoiceAudioResponse {
  asset: AudioAssetV3;
}

export interface AdminSpeechVoiceCapabilities {
  supports_volume_percent?: boolean;
  supports_pause?: boolean;
  supports_phoneme?: boolean;
  styles: string[];
  min_rate_percent: number;
  max_rate_percent: number;
  min_pitch_semitones: number;
  max_pitch_semitones: number;
}

export interface AdminSpeechVoiceMetadata {
  provider_voice_id: string;
  model: string;
  age_group: string | null;
  description: string | null;
  personalities: string[] | null;
  scenarios: string[] | null;
  roles: string[] | null;
  source_url: string;
  checked_at: string;
}

export type VoiceAccent = "gb" | "us" | "none";

export interface AdminSpeechVoice {
  accent?: VoiceAccent;
  accent_revision?: number;
  synthesis_available?: boolean;
  capability_evidence?: {
    provider_voice_id: string;
    locale: string;
    gender: string;
    model: string;
    styles: string[];
    supported_locales: string[] | null;
    roles: string[] | null;
    supports_style_degree: boolean | null;
    source_url: string;
    checked_at: string;
  };
  alias: string;
  display_name: string;
  is_common: boolean;
  locale: string;
  gender: string;
  metadata?: AdminSpeechVoiceMetadata | null;
  capabilities: AdminSpeechVoiceCapabilities;
}

export interface AdminDubbingRecommendation {
  selected?: boolean;
  id: string;
  name: string;
  voice_alias: string;
  parameters: AdminVoiceParameters;
}

export interface AdminDubbingGroup {
  revision?: number;
  is_global?: boolean;
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

export interface AdminDubbingPairVoice {
  id: string;
  voice_alias: string;
  parameters: AdminVoiceParameters;
}

export interface AdminDubbingRecommendationPair {
  id: string;
  name: string;
  selected: boolean;
  uk: AdminDubbingPairVoice;
  us: AdminDubbingPairVoice;
}

export type AdminDubbingRecommendationsV3 =
  | {
      format: "legacy";
      uk: AdminDubbingRecommendation[];
      us: AdminDubbingRecommendation[];
    }
  | { format: "paired"; pairs: AdminDubbingRecommendationPair[] };

export interface AdminDubbingGroupV3 {
  id: string;
  name: string;
  areas: string[];
  revision: number;
  is_global: boolean;
  recommendations: AdminDubbingRecommendationsV3;
}

export interface AdminDubbingGroupsV3Response {
  groups: AdminDubbingGroupV3[];
  revision: number;
  order_revision: number;
}

export interface SaveAdminPairedDubbingGroupInput {
  group: {
    id: string;
    name: string;
    areas: string[];
    is_global: boolean;
    pairs: AdminDubbingRecommendationPair[];
  };
  base_revision: number;
}

export interface AdminDubbingUpdateSettings {
  wait_seconds: number;
  revision: number;
}

export interface SaveAdminDubbingUpdateSettings {
  wait_seconds: number;
  base_revision: number;
}

export interface AdminDubbingAudioUpdate {
  id: string;
  group_id: string;
  group_name: string;
  group_revision: number;
  state: string;
  due_at: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  error_codes: string[];
}

export interface AdminDubbingAudioUpdates {
  updates: AdminDubbingAudioUpdate[];
}

export interface SaveAdminDubbingGroupsInput {
  groups: AdminDubbingGroup[];
  base_revision: number;
}

export interface AdminVoiceParameters {
  rate_percent: number;
  pitch_semitones: number;
  volume_percent?: number;
  style: string | null;
  style_degree?: number;
  role?: string;
}

export interface AdminVoiceLibraryItem {
  voice_alias: string;
  accent?: VoiceAccent;
  accent_revision?: number;
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
  output_format?: "mp3" | "wav";
  content: RichTextV2;
  voice_alias: string;
  style?: string | null;
  rate_percent?: number;
  pitch_semitones?: number;
  volume_percent?: number;
  style_degree?: number;
  role?: string;
}

export interface AdminSpeechPreviewResponse {
  content_path?: string;
  cache_status: "hit" | "generated";
  audio_url: string;
  expires_at: string;
  url_expires_in_seconds: number;
}
