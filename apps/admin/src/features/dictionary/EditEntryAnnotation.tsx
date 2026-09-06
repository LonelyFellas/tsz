import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client/http";
import type { AdminWordListItemAny, EntryAnnotationConflict } from "@tsz/types";
import { adminWordsAnyDataSource } from "./dataSource";
import { EntryAnnotationModal } from "./EntryAnnotationModal";
import { wordListLabel } from "./presentation";
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
        readOnly: item.entry_id !== entry.id
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
          const response = await adminWordsAnyDataSource.updateAnnotation(
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
