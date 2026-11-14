import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation,
  type LexiconEditorKey as CreationKey
} from "../i18n/editor";
import {
  defaultLexiconEditorTranslation,
  type LexiconEditorTranslation
} from "../i18n/editor";
const ISSUE_MESSAGE_KEYS = {
  form_content_mapping_invalid: "validation_form_content_mapping_invalid",
  invalid_regional_variant_shape: "validation_invalid_regional_variant_shape",
  dialect_rules_invalid: "validation_dialect_rules_invalid",
  invalid_form_type_for_part_of_speech:
    "validation_invalid_form_type_for_part_of_speech",
  forbidden_v3_field: "validation_forbidden_v3_field",
  duplicate_node_id: "validation_duplicate_node_id",
  duplicate_pos_code: "validation_duplicate_pos_code",
  pos_required: "validation_pos_required",
  part_of_speech_kind_mismatch: "validation_part_of_speech_kind_mismatch",
  form_group_membership_invalid: "validation_form_group_membership_invalid",
  orphan_form: "validation_orphan_form",
  form_group_required: "validation_form_group_required",
  empty_form_group: "validation_empty_form_group",
  base_form_required_in_group: "validation_base_form_required_in_group",
  spelling_rich_text_invalid: "validation_spelling_rich_text_invalid",
  variant_spelling_required: "validation_variant_spelling_required",
  pronunciation_required: "validation_pronunciation_required",
  duplicate_pronunciation: "validation_duplicate_pronunciation",
  content_limit_exceeded: "validation_content_limit_exceeded",
  sense_group_required: "validation_sense_group_required",
  sense_group_name_required: "validation_sense_group_name_required",
  sense_group_name_too_long: "validation_sense_group_name_too_long",
  pos_not_found: "validation_pos_not_found",
  duplicate_pos_meanings: "validation_duplicate_pos_meanings",
  grammar_required: "validation_grammar_required",
  grammar_variants_invalid: "validation_grammar_variants_invalid",
  grammar_form_link_invalid: "validation_grammar_form_link_invalid",
  sense_required: "validation_sense_required",
  level_invalid: "validation_level_invalid",
  sub_pos_required: "validation_sub_pos_required",
  invalid_sub_part_of_speech: "validation_invalid_sub_part_of_speech",
  frequency_invalid: "validation_frequency_invalid",
  sense_group_not_found: "validation_sense_group_not_found",
  sense_form_group_invalid: "validation_sense_form_group_invalid",
  dedicated_form_group_unused: "validation_dedicated_form_group_unused",
  sense_form_group_required: "validation_sense_form_group_required",
  definition_required: "validation_definition_required",
  definition_level_invalid: "validation_definition_level_invalid",
  definition_invalid: "validation_definition_invalid",
  phonetic_rich_text_invalid: "validation_phonetic_rich_text_invalid",
  audio_asset_invalid: "validation_audio_asset_invalid",
  native_definition_required: "validation_native_definition_required",
  sentence_level_invalid: "validation_sentence_level_invalid",
  sentence_incomplete: "validation_sentence_incomplete",
  sentence_translation_required: "validation_sentence_translation_required",
  sentence_translation_invalid: "validation_sentence_translation_invalid",
  duplicate_sentence_translation_band:
    "validation_duplicate_sentence_translation_band",
  sentence_link_role_invalid: "validation_sentence_link_role_invalid",
  duplicate_sentence_link: "validation_duplicate_sentence_link",
  relation_score_invalid: "validation_relation_score_invalid",
  relation_type_invalid: "validation_relation_type_invalid",
  relation_self_target: "validation_relation_self_target",
  relation_target_archived: "validation_relation_target_archived",
  relation_target_has_no_sense: "validation_relation_target_has_no_sense",
  relation_target_unavailable: "validation_relation_target_unavailable",
  relation_target_stale: "validation_relation_target_stale",
  sentence_context_target_unavailable:
    "validation_sentence_context_target_unavailable",
  relation_pending_headword_invalid:
    "validation_relation_pending_headword_invalid",
  relation_target_shape_invalid: "validation_relation_target_shape_invalid",
  relation_pending_gloss_without_headword:
    "validation_relation_pending_gloss_without_headword",
  relation_pending_gloss_invalid: "validation_relation_pending_gloss_invalid",
  relation_pending_gloss_conflict: "validation_relation_pending_gloss_conflict",
  relation_pending_gloss_target_exists:
    "validation_relation_pending_gloss_target_exists",
  relation_prebound_target_not_found:
    "validation_relation_prebound_target_not_found",
  relation_prebound_target_archived:
    "validation_relation_prebound_target_archived",
  relation_prebound_target_has_no_sense:
    "validation_relation_prebound_target_has_no_sense",
  relation_target_sense_deleted: "validation_relation_target_sense_deleted",
  node_id_reused: "validation_node_id_reused",
  node_binding_unknown: "validation_node_binding_unknown",
  node_binding_changed: "validation_node_binding_changed",
  meanings_storage_unsafe: "validation_meanings_storage_unsafe",
  pos_meanings_required: "validation_pos_meanings_required",
  sense_has_inbound_publication_refs:
    "validation_sense_has_inbound_publication_refs",
  phrase_component_not_allowed: "validation_phrase_component_not_allowed",
  phrase_component_limit_exceeded: "validation_phrase_component_limit_exceeded",
  phrase_component_literal_invalid:
    "validation_phrase_component_literal_invalid",
  phrase_component_self_target: "validation_phrase_component_self_target",
  phrase_component_target_unavailable:
    "validation_phrase_component_target_unavailable",
  phrase_component_target_nested: "validation_phrase_component_target_nested",
  phrase_component_target_stale: "validation_phrase_component_target_stale",
  voice_profile_invalid: "validation_voice_profile_invalid"
} as const;
import {
  HttpError,
  RequestTimeoutError,
  InvalidAdminWordResponseError,
  UnsupportedAdminWordSchemaVersionError
} from "@tsz/api-client";
import type { V3DraftValidationIssue } from "@tsz/types";
import type { V3Problem } from "./problem";

export function v3IssueMessage(
  issue: V3DraftValidationIssue,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  const phonemeField = /^synthesis\.(?:(?:uk|us)\.)?(ipa|ups)$/.exec(
    issue.field
  );
  if (
    phonemeField &&
    (issue.code === "content_limit_exceeded" ||
      issue.code === "pronunciation_required")
  ) {
    const name = phonemeField[1] === "ipa" ? "Azure IPA" : "Azure UPS";
    return issue.code === "content_limit_exceeded"
      ? t("validation_phoneme_long", { name })
      : t("validation_phoneme_required", { name });
  }
  if (issue.field === "text_links") return t("validation_text_links");
  return t(ISSUE_MESSAGE_KEYS[issue.code] ?? "validation_unknown");
}

// 同一个 code 会按字段分别下发（语义区间的中英文名各算一条）。只按文案去重会把它们
// 并成一句，管理员填完中文再点一次完成，又看到一模一样的提示，像是改了没生效。
const ISSUE_FIELD_SUFFIX: Record<string, CreationKey> = {
  name_zh: "creation_chinese",
  name_en: "creation_english_bd3ec6"
};

export function v3IssueMessages(
  issues: readonly V3DraftValidationIssue[],
  t: CreationTranslation = creationDefaultT
): string[] {
  return [
    ...new Set(
      issues.map(
        (issue) =>
          v3IssueMessage(issue, t) +
          (ISSUE_FIELD_SUFFIX[issue.field]
            ? t(ISSUE_FIELD_SUFFIX[issue.field]!)
            : "")
      )
    )
  ];
}

export function v3SaveProblemMessage(
  problem: V3Problem,
  t: CreationTranslation = creationDefaultT
): string {
  switch (problem.kind) {
    case "request":
      return t(
        problem.code === "invalid_speech_preview"
          ? "panel_save_invalid_speech"
          : "panel_save_invalid_request"
      );
    case "validation":
      return problem.issues[0]
        ? t("panel_save_validation", {
            issue: v3IssueMessage(problem.issues[0], t)
          })
        : t("panel_saving_failed_all_changes_are_retained_try_again");
    case "revision_conflict":
      return t("panel_save_conflict");
    case "authentication":
      return t("panel_save_expired");
    case "authorization":
      return t("panel_save_forbidden");
    case "network":
    case "server":
    case "service_unavailable":
      return t("panel_save_unavailable");
    default:
      return t("panel_saving_failed_all_changes_are_retained_try_again");
  }
}

export interface V3DetailErrorPresentation {
  title: string;
  description: string;
  retryable: boolean;
}

export function presentV3DetailError(
  error: unknown,
  t: CreationTranslation = creationDefaultT
): V3DetailErrorPresentation {
  const title = t("creation_cannot_open_entry");
  if (error instanceof UnsupportedAdminWordSchemaVersionError) {
    return {
      title,
      description: t(
        "creation_this_frontend_does_not_support_the_entry_version_upgrade_and_try_again"
      ),
      retryable: false
    };
  }
  if (error instanceof InvalidAdminWordResponseError) {
    return {
      title,
      description: t(
        "creation_the_entry_response_has_an_invalid_format_processing_has_stopped"
      ),
      retryable: false
    };
  }
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return {
        title,
        description: t(
          "creation_your_session_has_expired_sign_in_again_597b79"
        ),
        retryable: false
      };
    }
    if (error.status === 403) {
      return {
        title,
        description: t("creation_this_account_cannot_view_this_entry"),
        retryable: false
      };
    }
    if (error.status === 404 || error.code === "word_not_found") {
      return {
        title,
        description: t(
          "creation_this_entry_does_not_exist_or_has_been_deleted"
        ),
        retryable: false
      };
    }
    if (error.status === 422 && error.code === "unsupported_schema_version") {
      return {
        title,
        description: t(
          "creation_this_frontend_does_not_support_the_entry_version_upgrade_and_try_again"
        ),
        retryable: false
      };
    }
    if (error.status === 503) {
      return {
        title,
        description: t(
          "creation_the_entry_service_is_unavailable_try_again_later_e80864"
        ),
        retryable: true
      };
    }
    if (error.status >= 500) {
      return {
        title,
        description: t("creation_could_not_load_the_entry_try_again_later"),
        retryable: true
      };
    }
    return {
      title,
      description: t("creation_the_entry_cannot_be_opened_right_now"),
      retryable: false
    };
  }
  if (error instanceof TypeError || error instanceof RequestTimeoutError) {
    return {
      title,
      description: t(
        "creation_a_network_error_occurred_check_the_connection_and_try_again"
      ),
      retryable: true
    };
  }
  return {
    title,
    description: t("creation_the_entry_cannot_be_opened_right_now"),
    retryable: false
  };
}

export function shouldRetryV3Detail(
  failureCount: number,
  error: unknown
): boolean {
  return failureCount < 2 && presentV3DetailError(error).retryable;
}
