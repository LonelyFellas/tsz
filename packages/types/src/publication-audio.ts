import type { VoiceSettingV3 } from "./admin-word-v3";
import type { GeneratedSpeechSource } from "./admin-tts";

export type PublicationAudioIssue =
  | "missing_configuration"
  | "missing_asset"
  | "invalid_source"
  | "asset_unavailable"
  | "effect_mismatch"
  | "object_unavailable";

export interface PublicationAudioRequirement {
  target_id: string;
  content_id: string | null;
  source_path: string;
  default_for: ("uk" | "us" | "other")[];
  setting: VoiceSettingV3 | null;
  asset_id: string | null;
  source: GeneratedSpeechSource | null;
  issue: PublicationAudioIssue | null;
}

export interface PublicationAudioReview {
  manifest: {
    owner: { entry: string } | { sentence: string };
    revision: number;
    policy_version: number;
    items: PublicationAudioRequirement[];
    ready: boolean;
    manifest_hash: string;
  };
  confirmed: boolean;
  receipt_id: string | null;
}

export interface CheckPublicationAudioInput {
  base_revision: number;
}
export interface ConfirmPublicationAudioInput extends CheckPublicationAudioInput {
  manifest_hash: string;
}
