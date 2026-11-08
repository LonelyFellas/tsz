import { useLexiconEditorTranslation } from "./i18n/editor";
import {
  useLexiconEditorMessageState as useCreationMessageState,
  createLexiconEditorMessage as creationMessage
} from "./i18n/editor";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client/http";
import type { AdminWordListItemAny, EntryAnnotationConflict } from "@tsz/types";
import { adminWordsDataSource } from "./dataSource";
import { EntryAnnotationModal } from "./EntryAnnotationModal";
import { wordListLabel } from "./presentation";
import { isAnnotationOwnershipError } from "./annotationPermission";
import { wordKeys } from "./api";

export function EditEntryAnnotation({
  entry,
  onClose
}: {
  entry: AdminWordListItemAny;
  onClose: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<EntryAnnotationConflict>();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useCreationMessageState();
  const locked = useRef(false);
  const current = conflict?.entries.find((item) => item.entry_id === entry.id);
  const rows = conflict
    ? conflict.entries.map((item) => ({
        key: item.entry_id,
        label: item.presentation.label,
        annotation: item.annotation,
        posLabels: item.pos_labels,
        glossPreviews: item.gloss_previews,
        createdByName: item.created_by_name,
        updatedAt: item.updated_at,
        referenceCount: item.inbound_relations.total,
        href: `/words/${item.entry_id}/v3/wizard/forms`,
        // 这条 PATCH 只改一个词条，同组的其他行一律只读——列出来是为了避重。
        readOnly: item.entry_id !== entry.id,
        readOnlyHint:
          item.entry_id === entry.id
            ? undefined
            : t("creation_for_comparison_only")
      }))
    : [
        {
          key: entry.id,
          label: wordListLabel(entry),
          annotation: entry.annotation,
          posLabels: entry.pos_list,
          glossPreviews: entry.gloss ? [entry.gloss] : [],
          createdByName: entry.created_by_name,
          updatedAt: entry.updated_at,
          href: `/words/${entry.id}/v3/wizard/forms`
        }
      ];
  return (
    <EntryAnnotationModal
      key={version}
      rows={rows}
      groups={conflict?.groups ?? []}
      busy={busy}
      error={error}
      onClose={onClose}
      onSave={async (values) => {
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        setError(undefined);
        try {
          const response = await adminWordsDataSource.updateAnnotation(
            entry.id,
            {
              annotation: values[entry.id] || null,
              base_annotation_revision:
                current?.annotation_revision ?? entry.annotation_revision
            }
          );
          if (response.entry_id !== entry.id)
            throw new Error("Unexpected entry");
          await queryClient.invalidateQueries({ queryKey: wordKeys.all });
          onClose();
        } catch (error) {
          if (
            error instanceof HttpError &&
            error.status === 409 &&
            error.meta?.annotation_conflict
          ) {
            setConflict(error.meta.annotation_conflict);
            setVersion((version) => version + 1);
            setError(
              creationMessage(
                "creation_annotations_or_base_form_groups_have_changed_confirm_again_using_the_current_annotations"
              )
            );
          } else if (error instanceof HttpError && error.status === 403) {
            // 越权改不动，重试也不会好——不能混进「请重试」的通用文案里。
            setError(
              creationMessage(
                isAnnotationOwnershipError(error.code)
                  ? "creation_you_can_only_change_annotations_on_entries_you_created"
                  : "creation_this_account_cannot_change_this_entry_s_annotation"
              )
            );
          } else {
            setError(
              creationMessage(
                "creation_could_not_save_retry_if_the_previous_request_was_saved_the_latest_annotations_will_be_chec"
              )
            );
          }
        } finally {
          locked.current = false;
          setBusy(false);
        }
      }}
    />
  );
}
