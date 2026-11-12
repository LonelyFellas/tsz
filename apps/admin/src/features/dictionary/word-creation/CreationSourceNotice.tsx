import { useLexiconEditorTranslation } from "../i18n/editor";

import { Alert } from "@tsz/ui/admin/display";

export type CreationSource = "dictionary" | "dictionary-empty" | "blank";

export interface CreationNavigationState {
  creationSource: CreationSource;
}

export function creationSourceFromState(
  state: unknown
): CreationSource | undefined {
  if (
    typeof state !== "object" ||
    state === null ||
    !("creationSource" in state)
  ) {
    return undefined;
  }
  const source = state.creationSource;
  return source === "dictionary" ||
    source === "dictionary-empty" ||
    source === "blank"
    ? source
    : undefined;
}

export function CreationSourceNotice({ source }: { source?: CreationSource }) {
  const { t } = useLexiconEditorTranslation();
  if (!source) return null;
  if (source === "dictionary") {
    return (
      <Alert
        showIcon
        type="success"
        title={t(
          "creation_prefilled_from_the_built_in_dictionary_check_the_content"
        )}
      />
    );
  }
  return source === "dictionary-empty" ? (
    <Alert
      showIcon
      type="warning"
      title={t(
        "creation_suggested_parts_of_speech_have_not_been_added_enter_them_manually"
      )}
      description={t(
        "creation_this_draft_has_no_parts_of_speech_or_forms_use_add_part_of_speech_existing_content_from_du"
      )}
    />
  ) : (
    <Alert
      showIcon
      type="info"
      title={t(
        "creation_no_built_in_dictionary_suggestions_found_a_blank_draft_was_created"
      )}
    />
  );
}
