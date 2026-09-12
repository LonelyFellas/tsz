import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client/http";
import type { AdminWordListItemAny, EntryAnnotationConflict } from "@tsz/types";
import { adminWordsDataSource } from "./dataSource";
import { EntryAnnotationModal } from "./EntryAnnotationModal";
import { wordListLabel } from "./presentation";
import { annotationForbiddenMessage } from "./annotationPermission";
import { wordKeys } from "./api";

export function EditEntryAnnotation({
  entry,
  onClose
}: {
  entry: AdminWordListItemAny;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<EntryAnnotationConflict>();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const locked = useRef(false);
  const current = conflict?.entries.find((item) => item.entry_id === entry.id);
  const rows = conflict
    ? conflict.entries.map((item) => ({
        key: item.entry_id,
        label: item.presentation.label,
        annotation: item.annotation,
        gloss: [...item.pos_labels, ...item.gloss_previews].join(" · "),
        // 这条 PATCH 只改一个词条，同组的其他行一律只读——列出来是为了避重。
        readOnly: item.entry_id !== entry.id,
        readOnlyHint: item.entry_id === entry.id ? undefined : "仅供比对"
      }))
    : [
        {
          key: entry.id,
          label: wordListLabel(entry),
          annotation: entry.annotation,
          gloss: entry.gloss
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
            setError("标注或原型分组已变化，请根据当前标注重新确认。");
          } else if (error instanceof HttpError && error.status === 403) {
            // 越权改不动，重试也不会好——不能混进「请重试」的通用文案里。
            setError(annotationForbiddenMessage(error.code));
          } else {
            setError(
              "保存失败，请重试。若上次请求已保存，将重新确认最新标注。"
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
