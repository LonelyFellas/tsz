import type {
  CreateWordlist,
  UpdateWordlist,
  CustomWord,
  WordlistCandidate,
  WordlistContentItem,
  WordlistEditSnapshot
} from "@tsz/types";

export type WordlistSave =
  | { kind: "create"; body: CreateWordlist }
  | { kind: "update"; id: string; body: UpdateWordlist };
export type WordlistSaveRow = {
  id: string;
  entryId: string | null;
  itemId?: string;
  customWord?: CustomWord;
  text?: string;
  candidate?: WordlistCandidate;
  note?: string;
  authorNote?: string;
  noteRevision?: number;
  noteVersions?: Record<string, number | undefined>;
  noteDirty?: boolean;
  generateAudio?: boolean;
};
export type WordlistSaveForm = {
  name: string;
  rows: WordlistSaveRow[];
  initial?: WordlistEditSnapshot;
};
type ItemField = "customWord" | "text" | "authorNote" | "note";
type StoredForm = Omit<WordlistSaveForm, "rows" | "initial"> & {
  rows: (WordlistSaveRow & { itemFields?: ItemField[]; itemIndex?: number })[];
  initial?: Omit<WordlistEditSnapshot, "items"> & {
    items?: (WordlistContentItem | number)[];
  };
};
function requestItems(request: WordlistSave) {
  return request.kind === "create"
    ? request.body.items
    : request.body.content?.items;
}
function rowFields(
  item: CreateWordlist["items"][number] | WordlistContentItem
) {
  return {
    customWord: item.custom_word,
    text: item.custom_word?.word,
    authorNote: item.author_note,
    note: "private_note" in item ? item.private_note : undefined
  };
}
export function pendingSaveKey(userId: string, id?: string, folderId?: string) {
  return `tsz:wordlist-save:${userId}:${id ? `edit:${id}` : `new:${folderId ?? "root"}`}`;
}
export function readPendingSave(
  key: string
): { request: WordlistSave; form: WordlistSaveForm } | null {
  if (typeof window === "undefined") return null;
  const saved = sessionStorage.getItem(key);
  if (!saved) return null;
  const value = JSON.parse(saved) as {
    request: WordlistSave;
    form: StoredForm;
  };
  if (
    !value.request?.body ||
    !["create", "update"].includes(value.request.kind) ||
    !value.form
  )
    throw new Error("待确认的词表保存记录无法读取，请保留此页面并联系支持。");
  const items = requestItems(value.request);
  const initial = value.form.initial && {
    ...value.form.initial,
    items: value.form.initial.items?.map((item) =>
      typeof item === "number" ? (items![item] as WordlistContentItem) : item
    )
  };
  const sources = items ?? initial?.items;
  return {
    request: value.request,
    form: {
      ...value.form,
      initial,
      rows: value.form.rows.map(({ itemIndex, itemFields, ...row }) => {
        if (itemIndex !== undefined && itemFields) {
          const fields = rowFields(sources![itemIndex]!);
          for (const field of itemFields)
            Object.assign(row, { [field]: fields[field] });
        }
        return row;
      })
    }
  };
}
export function writePendingSave(
  key: string,
  request: WordlistSave,
  form: WordlistSaveForm
) {
  const items = requestItems(request);
  const sources = items ?? form.initial?.items;
  const indices = new Map(
    sources?.map((item, index) => [item.entry_id ?? item.item_id, index])
  );
  const initial = form.initial && {
    ...form.initial,
    items: form.initial.items?.map((item) => {
      const index = indices.get(item.entry_id ?? item.item_id);
      const source = items?.[index ?? -1];
      return source &&
        index !== undefined &&
        source.item_id === item.item_id &&
        source.entry_id === item.entry_id &&
        source.author_note === item.author_note &&
        source.custom_word?.word === item.custom_word?.word &&
        source.custom_word?.definition === item.custom_word?.definition
        ? index
        : item;
    })
  };
  const stored: StoredForm = {
    ...form,
    initial,
    rows: form.rows.map((row) => {
      const itemIndex = indices.get(row.entryId ?? row.itemId);
      if (itemIndex === undefined) return row;
      const fields = rowFields(sources![itemIndex]!);
      const copy: StoredForm["rows"][number] = { ...row };
      const itemFields: ItemField[] = [];
      for (const field of Object.keys(fields) as ItemField[]) {
        if (
          row[field] !== undefined &&
          JSON.stringify(row[field]) === JSON.stringify(fields[field])
        ) {
          delete copy[field];
          itemFields.push(field);
        }
      }
      return itemFields.length ? { ...copy, itemIndex, itemFields } : copy;
    })
  };
  // Persist before dispatch; sessionStorage isolates tabs and survives reload/login.
  sessionStorage.setItem(key, JSON.stringify({ request, form: stored }));
}
export function removePendingSave(key: string, request: WordlistSave) {
  const saved = sessionStorage.getItem(key);
  // A completed request must never erase a newer operation at the same target.
  if (
    saved &&
    JSON.stringify(JSON.parse(saved).request) === JSON.stringify(request)
  )
    sessionStorage.removeItem(key);
}
