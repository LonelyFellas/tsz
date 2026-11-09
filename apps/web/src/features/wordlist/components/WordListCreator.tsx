"use client";
import {
  lookupWebNotice,
  webCommon,
  localText,
  webErrorText,
  LocalWebError,
  type WebNotice
} from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webWordlistEditor as webWordlist } from "@/i18n/messages/wordlist/editor";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Modifier
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { HttpError } from "@tsz/api-client";
import type {
  UpdateWordlist,
  WordlistCustomAudio,
  MyWordlistItem,
  WordlistCandidate,
  WordlistEditSnapshot,
  WordlistEntry
} from "@tsz/types";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { wordListKeys } from "../hooks/useWordLists";
import { useCustomAudio } from "../hooks/useCustomAudio";
import {
  pendingSaveKey,
  readPendingSave,
  writePendingSave,
  removePendingSave,
  type WordlistSave,
  type WordlistSaveRow as Row
} from "../pending-save";
import { formatCoins, wordlistAudioWord } from "@tsz/shared";
import { Button, Input, FormField } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { PageNotice, PageShell, Pager } from "@/features/shell/Page";
import { ExcelImport } from "./ExcelImport";
import { SortableWordRow } from "./SortableWordRow";
import { createWordRowPreview, WordRowDragPreview } from "./WordRowDragPreview";

const audioStatusMessages = {
  queued: localText(webWordlist, "webWordlistEditor:audio_queued"),
  processing: localText(webWordlist, "webWordlistEditor:generating_audio"),
  ready: localText(webWordlist, "webWordlistEditor:audio_generated"),
  refunding: localText(
    webWordlist,
    "webWordlistEditor:audio_incomplete_refund_processing"
  ),
  refunded: localText(
    webWordlist,
    "webWordlistEditor:audio_incomplete_refunded"
  )
};
const unavailableReasonMessages = {
  archived: localText(webWordlist, "webWordlistEditor:moved_to_trash"),
  unpublished: localText(webWordlist, "webWordlistEditor:not_published"),
  unsupported_schema: localText(
    webWordlist,
    "webWordlistEditor:this_publication_version_is_not_supported_yet"
  )
};
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
type RowField = "word" | "definition" | "author-note" | "private-note";
const rowKey = (row: Row) => row.entryId ?? row.itemId!;
const itemKey = (item: MyWordlistItem) => item.item_id ?? item.entry_id!;
const emptyRow = (): Row => ({
  id: crypto.randomUUID(),
  entryId: null,
  text: "",
  note: ""
});
const field =
  "min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-normal leading-6 text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/15";
function glosses(entry?: WordlistEntry | null) {
  return (
    entry?.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.definitions.flatMap((definition) =>
          definition.texts.map((text) => text.content.text)
        )
      )
    ) ?? []
  );
}
export function WordListCreator({
  id,
  folderId,
  embedded = false,
  onSaved,
  onCancel
}: {
  id?: string;
  folderId?: string;
  embedded?: boolean;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const uiText = useWebText(webWordlist);
  const userId = useUserStore((s) => s.user?.id);
  const snapshot = useQuery({
    queryKey: [...wordListKeys.mine(userId), "edit", id],
    queryFn: ({ signal }) => api.wordList.edit(id!, { signal }),
    enabled: !!userId && !!id,
    refetchOnWindowFocus: false,
    refetchOnMount: "always"
  });
  if (!userId) return null;
  let hasPending = false;
  try {
    hasPending =
      typeof window !== "undefined" &&
      !!sessionStorage.getItem(pendingSaveKey(userId, id, folderId));
  } catch {
    /* The editor reports storage failures before dispatch. */
  }
  if (id && snapshot.isError && !hasPending)
    return (
      <PageShell size="lg" embedded={embedded}>
        <PageNotice tone="error">
          {uiText("webWordlistEditor:could_not_load_editing_data")}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={() => void snapshot.refetch()}
          >
            {uiText("webWordlistEditor:retry")}
          </Button>
        </PageNotice>
      </PageShell>
    );
  if (id && !snapshot.data && !hasPending)
    return (
      <PageShell size="lg" embedded={embedded}>
        <PageNotice>{uiText("webWordlistEditor:loading_word_list")}</PageNotice>
      </PageShell>
    );
  return (
    <Editor
      key={`${userId}:${id ?? "new"}`}
      userId={userId}
      folderId={folderId}
      embedded={embedded}
      onSaved={onSaved}
      onCancel={onCancel}
      id={id}
      initial={snapshot.data}
    />
  );
}
function Editor({
  userId,
  folderId,
  embedded,
  onSaved,
  onCancel,
  id,
  initial: snapshot
}: {
  userId: string;
  folderId?: string;
  embedded?: boolean;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
  id?: string;
  initial?: WordlistEditSnapshot;
}) {
  const uiText = useWebText(webWordlist);
  const storageKey = pendingSaveKey(userId, id, folderId);
  const [recovery] = useState(() => {
    try {
      return { saved: readPendingSave(storageKey), error: "" as const };
    } catch {
      return {
        saved: null,
        error: localText(
          webWordlist,
          "webWordlistEditor:cannot_read_the_pending_save_record_keep_this_page_open_and_contact_supp"
        )
      };
    }
  });
  const [initial] = useState(recovery.saved?.form.initial ?? snapshot);
  const [originalIds] = useState(
    () =>
      new Set(initial?.items?.map((item) => item.item_id) ?? initial?.entry_ids)
  );
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState(
    recovery.saved?.form.name ?? initial?.wordlist.name ?? ""
  );
  const [rows, setRows] = useState<Row[]>(
    () =>
      recovery.saved?.form.rows ??
      (initial
        ? (
            initial.items ??
            initial.entry_ids.map((entry_id) => ({
              item_id: entry_id,
              entry_id
            }))
          ).map((item) => ({
            id: crypto.randomUUID(),
            entryId: item.entry_id ?? null,
            itemId: item.item_id,
            customWord: "custom_word" in item ? item.custom_word : undefined
          }))
        : [emptyRow()])
  );
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<WebNotice>(
    recovery.error ||
      (recovery.saved
        ? localText(
            webWordlist,
            "webWordlistEditor:the_previous_save_is_unconfirmed_retry_saving_to_check_the_result"
          )
        : "")
  );
  const [nameInvalid, setNameInvalid] = useState(false);
  const [uncertain, setUncertain] = useState(
    !!recovery.saved || !!recovery.error
  );
  const nameInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const pending = useRef<WordlistSave | null>(recovery.saved?.request ?? null);
  const [dragPreview, setDragPreview] = useState<HTMLElement | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const allowLeave = useRef(false);
  const locked =
    initial?.wordlist.state === "published" ||
    initial?.wordlist.state === "pending";
  const [session] = useState(() => crypto.randomUUID());
  const [filter, setFilter] = useState("");
  const [errorRow, setErrorRow] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<RowField>("word");
  const loaded = useQuery({
    queryKey: [...wordListKeys.mine(userId), "edit-items", id, session],
    queryFn: async ({ signal }) => {
      const items: MyWordlistItem[] = [];
      const ids =
        initial!.items?.map((item) => item.item_id) ?? initial!.entry_ids;
      for (
        let batch = 1;
        batch <= Math.max(1, Math.ceil(ids.length / 100));
        batch++
      ) {
        const data = await api.wordList.myItems(
          id!,
          { page: batch, page_size: 100 },
          { signal }
        );
        if (
          data.revision !== initial!.wordlist.revision ||
          data.pagination.total !== ids.length ||
          data.items.length !== Math.min(100, ids.length - items.length) ||
          data.items.some(
            (item, offset) => itemKey(item) !== ids[items.length + offset]
          )
        ) {
          throw new LocalWebError(
            localText(
              webWordlist,
              "webWordlistEditor:the_list_version_changed_reopen_it_before_editing"
            )
          );
        }
        items.push(...data.items);
      }
      return items;
    },
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const loadingItems = !!id && !loaded.data && !uncertain;
  const customIds = rows.flatMap((row) =>
    row.customWord && originalIds.has(rowKey(row)) ? [rowKey(row)] : []
  );
  const audio = useCustomAudio(
    id,
    customIds,
    true,
    userId,
    customIds.length > 0
  );
  const audioByItem = new Map(
    audio.data?.items.map((item) => [item.item_id, item])
  );
  const selectedAudio = rows.filter((row) => {
    if (!row.customWord || !row.generateAudio) return false;
    const job = audioByItem.get(rowKey(row));
    return !(
      job &&
      (job.status === "refunding" ||
        (job.word === wordlistAudioWord(row.customWord.word) &&
          job.status !== "refunded"))
    );
  });
  const audioCost = BigInt(selectedAudio.length) * 2n;
  const wallet = useQuery({
    queryKey: ["coins", "user", userId, "wallet"],
    enabled: rows.some((row) => row.customWord),
    queryFn: ({ signal }) => api.coins.wallet({ signal }),
    refetchOnMount: "always"
  });
  const insufficient = !!wallet.data && BigInt(wallet.data.balance) < audioCost;
  // Only this editing session's complete, revision-checked response supplies notes.
  const cache = new Map(loaded.data?.map((item) => [itemKey(item), item]));
  function authorNoteFor(row: Row) {
    return row.authorNote ?? cache.get(rowKey(row))?.author_note ?? "";
  }
  function noteRevisionFor(entryId: string) {
    return originalIds.has(entryId) ? cache.get(entryId)?.note_revision : 1;
  }
  useEffect(() => {
    if (!dirty && !importOpen && !saving && !uncertain) return;
    const prevent = (e: BeforeUnloadEvent) => {
      if (!allowLeave.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      const link =
        e.target instanceof Element
          ? e.target.closest("a[href], [data-leaves-page]")
          : null;
      if (
        !link ||
        (link instanceof HTMLAnchorElement &&
          (link.target === "_blank" ||
            link.hasAttribute("download") ||
            link.href === window.location.href)) ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      if (
        savingRef.current ||
        !window.confirm(
          uiText("webWordlistEditor:you_have_unsaved_changes_leave")
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        allowLeave.current = true;
      }
    };
    const navigate = (e: NavigateEvent) => {
      if (
        e.navigationType !== "traverse" ||
        allowLeave.current ||
        e.hashChange ||
        !e.cancelable
      )
        return;
      if (
        savingRef.current ||
        !window.confirm(
          uiText("webWordlistEditor:you_have_unsaved_changes_leave")
        )
      )
        e.preventDefault();
      else allowLeave.current = true;
    };
    const restoreProtection = () => {
      allowLeave.current = false;
    };
    window.addEventListener("tsz:page-leave-finished", restoreProtection);
    window.addEventListener("beforeunload", prevent);
    if (window.navigation)
      window.navigation.addEventListener("navigate", navigate);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("tsz:page-leave-finished", restoreProtection);
      window.removeEventListener("beforeunload", prevent);
      document.removeEventListener("click", click, true);
      window.navigation?.removeEventListener("navigate", navigate);
    };
  }, [dirty, importOpen, saving, uncertain, uiText]);
  function change(rowId: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
    setDirty(true);
    setError("");
    setErrorRow(null);
  }
  function move(rowId: string, target: string) {
    setRows((current) => {
      const a = current.findIndex((r) => r.id === rowId),
        b = current.findIndex((r) => r.id === target);
      if (a < 0 || b < 0) return current;
      const next = [...current];
      const [row] = next.splice(a, 1);
      next.splice(b, 0, row!);
      return next;
    });
    setDirty(true);
  }
  function invalidRow(message: WebNotice, row: Row, target: RowField = "word") {
    setError(message);
    setErrorRow(row.id);
    setErrorField(target);
    setFilter("");
    setPage(Math.floor(rows.indexOf(row) / 50) + 1);
    requestAnimationFrame(() => {
      document.getElementById(`${target}-${row.id}`)?.focus();
    });
  }
  async function save() {
    if (savingRef.current || loadingItems || recovery.error) return;
    if (pending.current) return dispatchSave(pending.current);
    if (
      selectedAudio.length &&
      (insufficient || wallet.data?.status !== "open" || wallet.isError)
    ) {
      setError(
        insufficient
          ? localText(
              webWordlist,
              "webWordlistEditor:insufficient_balance_your_input_is_preserved_add_and_try_again"
            )
          : localText(
              webWordlist,
              "webWordlistEditor:the_wallet_is_unavailable_refresh_your_balance_and_retry_your_input_is_p"
            )
      );
      return;
    }
    if (selectedAudio.length && id && customIds.length && !audio.isSuccess) {
      setError(
        localText(
          webWordlist,
          "webWordlistEditor:audio_is_unavailable_your_input_is_preserved_retry_later_or_explicitly_c"
        )
      );
      return;
    }
    if (!name.trim() || [...name].length > 100) {
      setError(
        localText(
          webWordlist,
          "webWordlistEditor:use_1_100_characters_for_the_name"
        )
      );
      setNameInvalid(true);
      nameInput.current?.focus();
      return;
    }
    const unmatched = rows.find((r) => !r.entryId && !r.customWord);
    if (unmatched) {
      invalidRow(
        localText(
          webWordlist,
          "webWordlistEditor:select_a_platform_entry_or_enter_a_custom_entry_in_every_row"
        ),
        unmatched
      );
      return;
    }
    const invalidCustom = rows.find(
      (row) =>
        row.customWord &&
        (!row.customWord.word.trim() ||
          [...row.customWord.word].length > 50 ||
          !row.customWord.definition.trim() ||
          [...row.customWord.definition].length > 200)
    );
    if (invalidCustom) {
      invalidRow(
        localText(
          webWordlist,
          "webWordlistEditor:use_1_50_characters_for_custom_entries_and_1_200_for_their_definitions"
        ),
        invalidCustom,
        !invalidCustom.customWord!.word.trim() ||
          [...invalidCustom.customWord!.word].length > 50
          ? "word"
          : "definition"
      );
      return;
    }
    const seenIds = new Set<string>();
    const duplicate = rows.find((row) => {
      if (seenIds.has(rowKey(row))) return true;
      seenIds.add(rowKey(row));
      return false;
    });
    if (duplicate) {
      invalidRow(
        localText(
          webWordlist,
          "webWordlistEditor:entries_must_not_be_duplicated"
        ),
        duplicate
      );
      return;
    }
    const longNote = rows.find(
      (r) =>
        [...(r.note ?? "")].length > 1000 || [...authorNoteFor(r)].length > 1000
    );
    if (longNote) {
      invalidRow(
        localText(
          webWordlist,
          "webWordlistEditor:notes_must_not_exceed_1_000_characters"
        ),
        longNote,
        [...authorNoteFor(longNote)].length > 1000
          ? "author-note"
          : "private-note"
      );
      return;
    }
    if (
      rows.some(
        (r) =>
          r.noteDirty &&
          rowKey(r) &&
          (r.noteRevision ?? noteRevisionFor(rowKey(r))) === undefined
      )
    ) {
      setError(
        localText(
          webWordlist,
          "webWordlistEditor:meanings_and_notes_are_still_loading_try_again_shortly"
        )
      );
      return;
    }
    const audioGeneration = selectedAudio.length
      ? {
          item_ids: selectedAudio.map(rowKey),
          expected_cost: audioCost.toString()
        }
      : undefined;
    let request: WordlistSave;
    if (id && initial) {
      const same =
        name === initial.wordlist.name &&
        JSON.stringify(rows.map(rowKey)) ===
          JSON.stringify(
            initial.items?.map((item) => item.item_id) ?? initial.entry_ids
          ) &&
        rows.every(
          (row) =>
            authorNoteFor(row) ===
              (cache.get(rowKey(row))?.author_note ?? "") &&
            JSON.stringify(row.customWord) ===
              JSON.stringify(cache.get(rowKey(row))?.custom_word)
        );
      const body: UpdateWordlist = {
        ...(audioGeneration || audio.isSuccess
          ? { idempotency_key: crypto.randomUUID() }
          : {}),
        ...(audioGeneration ? { audio_generation: audioGeneration } : {}),
        expected_revision: initial.wordlist.revision,
        content: same
          ? null
          : {
              name,
              ...(rows.some((row) => row.customWord) ||
              initial.items?.some((item) => item.custom_word)
                ? {
                    items: rows.map((row) => ({
                      item_id: rowKey(row),
                      ...(row.entryId
                        ? { entry_id: row.entryId }
                        : { custom_word: row.customWord! }),
                      author_note: authorNoteFor(row)
                    }))
                  }
                : {
                    entry_ids: rows.map((r) => r.entryId!),
                    ...(rows.some((row) => authorNoteFor(row)) ||
                    loaded.data?.some((item) => item.author_note)
                      ? {
                          author_notes: rows.map((row) => ({
                            entry_id: row.entryId!,
                            author_note: authorNoteFor(row)
                          }))
                        }
                      : {})
                  })
            },
        note_updates: rows
          .filter(
            (r) =>
              r.note !== undefined &&
              (r.noteDirty || !originalIds.has(rowKey(r)))
          )
          .map((r) => ({
            ...(r.entryId ? { entry_id: r.entryId } : { item_id: rowKey(r) }),
            private_note: r.note!,
            expected_note_revision:
              r.noteRevision ?? noteRevisionFor(rowKey(r))!
          }))
      };
      request = { kind: "update", id, body };
    } else {
      request = {
        kind: "create",
        body: {
          ...(audioGeneration ? { audio_generation: audioGeneration } : {}),
          idempotency_key: crypto.randomUUID(),
          ...(folderId ? { folder_id: folderId } : {}),
          name,
          items: rows.map((r) => ({
            ...(r.entryId
              ? { entry_id: r.entryId }
              : { item_id: rowKey(r), custom_word: r.customWord! }),
            private_note: r.note ?? "",
            ...(authorNoteFor(r) ? { author_note: authorNoteFor(r) } : {})
          }))
        }
      };
    }
    try {
      writePendingSave(storageKey, request, {
        name,
        initial,
        rows: rows.map((row) => ({
          ...row,
          authorNote: authorNoteFor(row),
          note: row.note ?? cache.get(rowKey(row))?.private_note ?? "",
          text:
            row.customWord?.word ??
            row.text ??
            cache.get(rowKey(row))?.entry?.label
        }))
      });
    } catch {
      setError(
        localText(
          webWordlist,
          "webWordlistEditor:cannot_preserve_the_save_record_so_nothing_was_submitted_allow_browser_s"
        )
      );
      return;
    }
    pending.current = request;
    await dispatchSave(request);
  }
  async function dispatchSave(request: WordlistSave) {
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result =
        request.kind === "create"
          ? await api.wordList.create(request.body)
          : await api.wordList.update(request.id, request.body);
      removePendingSave(storageKey, request);
      pending.current = null;
      setUncertain(false);
      allowLeave.current = true;
      setDirty(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: wordListKeys.all }),
        client.invalidateQueries({ queryKey: ["coins", "user", userId] })
      ]);
      if (onSaved) onSaved(result.id);
      else router.push(`/account/wordlists/${result.id}`);
    } catch (e) {
      const audioUnavailable =
        e instanceof HttpError &&
        !!request.body.audio_generation &&
        [
          "speech_provider_unavailable",
          "speech_storage_unavailable",
          "speech_voice_not_found"
        ].includes(e.code ?? "");
      // Keep keyed commands frozen until replay confirms the earlier attempt.
      // Legacy updates cannot replay a committed revision; reopen to reconcile them.
      const canReplay =
        request.kind === "create" || !!request.body.idempotency_key;
      const unknown =
        (uncertain && canReplay) ||
        (!audioUnavailable &&
          (!(e instanceof HttpError) || e.status >= 500 || e.status === 408));
      if (!unknown) {
        removePendingSave(storageKey, request);
        pending.current = null;
      }
      setUncertain(unknown);
      const messages: Record<string, WebNotice> = {
        coin_insufficient_balance: localText(
          webWordlist,
          "webWordlistEditor:insufficient_balance_save_incomplete_your_input_is_preserved_add_and_ret"
        ),
        coin_wallet_unavailable: localText(
          webWordlist,
          "webWordlistEditor:your_account_has_transactions_paused_save_incomplete_your_input_is_prese"
        ),
        coin_idempotency_conflict: localText(
          webWordlist,
          "webWordlistEditor:save_records_are_inconsistent_check_your_word_list_and_transactions_firs"
        ),
        coin_source_conflict: localText(
          webWordlist,
          "webWordlistEditor:this_charge_has_already_been_processed_check_your_word_list_and_transact"
        ),
        word_list_audio_cost_changed: localText(
          webWordlist,
          "webWordlistEditor:audio_pricing_changed_and_nothing_was_saved_check_the_refreshed_audio_st"
        )
      };
      if (e instanceof HttpError && e.code?.startsWith("coin_"))
        void client.invalidateQueries({ queryKey: ["coins", "user", userId] });
      if (e instanceof HttpError && e.code === "word_list_audio_cost_changed") {
        if (id) void audio.refetch();
      }
      setError(
        unknown
          ? localText(
              webWordlist,
              "webWordlistEditor:the_save_result_is_unconfirmed_retry_saving_this_content_is_locked_until"
            )
          : uncertain && !canReplay
            ? localText(
                webWordlist,
                "webWordlistEditor:the_previous_save_is_still_unconfirmed_and_cannot_be_retried_in_this_ver"
              )
            : audioUnavailable
              ? localText(
                  webWordlist,
                  "webWordlistEditor:audio_is_unavailable_nothing_was_saved_or_charged_your_input_is_preserve"
                )
              : e instanceof HttpError && lookupWebNotice(messages, e.code)
                ? lookupWebNotice(messages, e.code)!
                : e instanceof HttpError && e.status === 413
                  ? localText(
                      webWordlist,
                      "webWordlistEditor:the_list_is_too_large_remove_entries_or_shorten_notes_and_retry_your_edi"
                    )
                  : request.body.audio_generation &&
                      e instanceof HttpError &&
                      [400, 404, 422, 501].includes(e.status)
                    ? localText(
                        webWordlist,
                        "webWordlistEditor:audio_is_unavailable_or_the_request_was_rejected_your_input_is_preserved"
                      )
                    : localText(
                        webWordlist,
                        "webWordlistEditor:save_failed_content_version_or_entry_status_changed_check_your_input_reo"
                      )
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (error && !saving && !nameInvalid && !errorRow)
      saveButton.current?.focus();
  }, [error, saving, nameInvalid, errorRow]);
  const searchTerm = filter.trim().toLowerCase();
  const matches = rows.filter((row) => {
    if (!searchTerm) return true;
    const stored = cache.get(rowKey(row));
    return [
      row.customWord?.word ??
        row.text ??
        stored?.entry?.label ??
        stored?.entry_label ??
        "",
      row.customWord?.definition ?? "",
      authorNoteFor(row),
      row.note ?? stored?.private_note ?? "",
      ...(row.candidate?.glosses ?? glosses(stored?.entry))
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm);
  });
  const pages = Math.max(1, Math.ceil(matches.length / 50));
  const currentPage = Math.min(page, pages);
  const visible = loadingItems
    ? []
    : matches.slice((currentPage - 1) * 50, currentPage * 50);
  const replaceEmpty =
    rows.length === 1 &&
    !rows[0]!.entryId &&
    !rows[0]!.customWord &&
    !rows[0]!.text &&
    !rows[0]!.note &&
    !rows[0]!.authorNote;
  function cancel() {
    if (
      savingRef.current ||
      (dirty &&
        !window.confirm(
          uiText("webWordlistEditor:you_have_unsaved_changes_leave")
        ))
    )
      return;
    allowLeave.current = true;
    if (onCancel) onCancel();
    else router.push(id ? `/account/wordlists/${id}` : "/account/wordlists");
  }
  if (importOpen)
    return (
      <PageShell size="lg" embedded={embedded}>
        <ExcelImport
          existingIds={
            new Set(rows.flatMap((row) => (row.entryId ? [row.entryId] : [])))
          }
          remaining={10000 - (replaceEmpty ? 0 : rows.length)}
          onCancel={() => setImportOpen(false)}
          onAppend={(words) => {
            setRows((current) => [
              ...(replaceEmpty ? [] : current),
              ...words.map(({ candidate, customWord, authorNote }) => ({
                id: crypto.randomUUID(),
                entryId: candidate?.entry_id ?? null,
                itemId: customWord ? crypto.randomUUID() : undefined,
                text: candidate?.label ?? customWord?.word,
                customWord,
                candidate,
                note: "",
                authorNote
              }))
            ]);
            setFilter("");
            setPage(Math.floor((replaceEmpty ? 0 : rows.length) / 50) + 1);
            setDirty(true);
            setError("");
            setErrorRow(null);
            setImportOpen(false);
          }}
        />
      </PageShell>
    );
  return (
    <PageShell size="lg" embedded={embedded}>
      {!embedded && (
        <button
          type="button"
          disabled={saving}
          className="-ml-3 mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={cancel}
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
          {uiText("webWordlistEditor:back")}
        </button>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
        {id
          ? uiText("webWordlistEditor:edit_word_list")
          : uiText("webWordlistEditor:create_word_list")}
      </h1>
      {locked && (
        <p className="mt-3 text-sm leading-6 text-foreground-muted">
          {uiText(
            "webWordlistEditor:public_lists_and_lists_under_review_allow_changes_only_to_existing_priva"
          )}
        </p>
      )}
      <header className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <FormField
            htmlFor="wordlist-name"
            label={uiText("webWordlistEditor:word_list_name")}
          >
            <Input
              id="wordlist-name"
              ref={nameInput}
              aria-label={uiText("webWordlistEditor:word_list_name")}
              aria-invalid={nameInvalid}
              aria-describedby={error ? "wordlist-save-error" : undefined}
              placeholder={uiText("webWordlistEditor:enter_a_word_list_name")}
              value={name}
              maxLength={100}
              disabled={locked || saving || uncertain}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
                setNameInvalid(false);
                setError("");
              }}
            />
          </FormField>
        </div>
        {embedded && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={cancel}
          >
            {uiText("webWordlistEditor:cancel")}
          </Button>
        )}
      </header>
      {loadingItems && (
        <p
          role={loaded.isError ? "alert" : "status"}
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm text-foreground-muted"
        >
          {loaded.isError
            ? loaded.error instanceof Error
              ? uiText(
                  webErrorText(
                    loaded.error,
                    localText(webCommon, "webCommon:response_unavailable")
                  )
                )
              : uiText("webWordlistEditor:could_not_load_meanings_and_notes")
            : uiText("webWordlistEditor:loading_entries_2")}
          {loaded.isError && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loaded.refetch()}
            >
              {uiText("webWordlistEditor:retry_loading")}
            </Button>
          )}
        </p>
      )}
      <section
        aria-label={uiText("webWordlistEditor:entry_editor")}
        aria-busy={saving}
        className="sticky top-16 z-20 my-6 border-b border-border/70 bg-surface py-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="wordlist-filter"
            aria-label={uiText("webWordlistEditor:search_within_list")}
            className="min-w-40 flex-1 sm:max-w-sm"
            value={filter}
            disabled={loadingItems}
            placeholder={uiText(
              "webWordlistEditor:search_entries_definitions_or_notes"
            )}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          />
          <div className="ml-auto flex flex-wrap justify-end gap-1 sm:gap-2">
            {!locked && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={uiText("webWordlistEditor:excel_import")}
                  className="min-h-11 px-2 sm:px-3"
                  disabled={
                    locked ||
                    saving ||
                    uncertain ||
                    loadingItems ||
                    rows.length >= 10000
                  }
                  onClick={() => setImportOpen(true)}
                >
                  <span className="hidden sm:inline">
                    {uiText("webWordlistEditor:excel_import")}
                  </span>
                  <span className="sm:hidden">
                    {uiText("webWordlistEditor:import")}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-3"
                  disabled={
                    locked ||
                    saving ||
                    uncertain ||
                    loadingItems ||
                    rows.length >= 10000
                  }
                  onClick={() => {
                    setFilter("");
                    const row = emptyRow();
                    setRows((rs) => [...rs, row]);
                    setPage(Math.ceil((rows.length + 1) / 50));
                    setDirty(true);
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLInputElement>(`#row-${row.id} input`)
                        ?.focus()
                    );
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  {uiText("webWordlistEditor:add_entry")}
                </Button>
              </>
            )}
            <Button
              type="button"
              ref={saveButton}
              disabled={
                saving ||
                loadingItems ||
                !!recovery.error ||
                (!uncertain &&
                  selectedAudio.length > 0 &&
                  (wallet.isFetching ||
                    !wallet.data ||
                    insufficient ||
                    wallet.data.status !== "open" ||
                    (customIds.length > 0 && !audio.isSuccess)))
              }
              onClick={() => void save()}
            >
              {saving
                ? uiText("webWordlistEditor:saving")
                : uncertain
                  ? uiText("webWordlistEditor:retry_save")
                  : locked
                    ? uiText("webWordlistEditor:save_notes")
                    : selectedAudio.length
                      ? uiText("webWordlistEditor:pay_v0_and_save", {
                          v0: audioCost.toString()
                        })
                      : uiText("webWordlistEditor:save")}
            </Button>
          </div>
        </div>
        {!locked && rows.some((row) => row.customWord) && (
          <div className="mt-3 text-sm leading-6 text-foreground-muted">
            <p>
              {uiText("webWordlistEditor:audio_cost")}
              {audioCost.toString()}{" "}
              {uiText(
                "webWordlistEditor:one_british_and_one_american_recording_per_word_costing_2_in_total_charg"
              )}
            </p>
            <p>
              {wallet.isError
                ? uiText(
                    "webWordlistEditor:could_not_read_your_balance_the_current_balance_is_unknown"
                  )
                : wallet.data
                  ? uiText("webWordlistEditor:balance_v0", {
                      v0: formatCoins(wallet.data.balance)
                    })
                  : uiText("webWordlistEditor:loading_balance")}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={wallet.isFetching}
                onClick={() => void wallet.refetch()}
              >
                {uiText("webWordlistEditor:refresh_balance")}
              </Button>
            </p>
            {insufficient && (
              <p role="status">
                {uiText(
                  "webWordlistEditor:insufficient_balance_your_input_is_preserved_add_to_save"
                )}
              </p>
            )}
            {wallet.data && wallet.data.status !== "open" && (
              <p role="status">
                {uiText(
                  "webWordlistEditor:your_account_has_transactions_paused_audio_generation_is_unavailable"
                )}
              </p>
            )}
            {audio.isError && (
              <p role="status">
                {uiText(
                  "webWordlistEditor:audio_is_unavailable_you_can_still_edit_text"
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void audio.refetch()}
                >
                  {uiText("webWordlistEditor:retry_loading_audio")}
                </Button>
              </p>
            )}
          </div>
        )}
        {error && (
          <p
            id="wordlist-save-error"
            role="alert"
            className="mt-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {uiText(error)}
          </p>
        )}
      </section>
      {matches.length === 0 && (
        <PageNotice>
          {filter.trim()
            ? uiText("webWordlistEditor:no_matching_entries")
            : uiText("webWordlistEditor:no_entries_yet")}
          {filter.trim() && (
            <Button
              type="button"
              variant="ghost"
              className="ml-2"
              onClick={() => {
                setFilter("");
                setPage(1);
              }}
            >
              {uiText("webWordlistEditor:clear_search")}
            </Button>
          )}
        </PageNotice>
      )}
      <DndContext
        id="wordlist-entry-sort"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        autoScroll={{ threshold: { x: 0, y: 0.12 }, acceleration: 8 }}
        accessibility={{
          screenReaderInstructions: {
            draggable: uiText(
              "webWordlistEditor:press_space_to_pick_up_an_entry_use_up_or_down_to_reorder_then_space_to"
            )
          },
          announcements: {
            onDragStart: ({ active }) =>
              uiText("webWordlistEditor:picked_up_entry_v0", {
                v0: rows.findIndex((row) => row.id === active.id) + 1
              }),
            onDragOver: ({ over }) =>
              over
                ? uiText("webWordlistEditor:destination_position_v0", {
                    v0: rows.findIndex((row) => row.id === over.id) + 1
                  })
                : undefined,
            onDragEnd: ({ over }) =>
              over
                ? uiText("webWordlistEditor:dropped_at_position_v0", {
                    v0: rows.findIndex((row) => row.id === over.id) + 1
                  })
                : uiText("webWordlistEditor:reordering_cancelled"),
            onDragCancel: () => uiText("webWordlistEditor:reordering_cancelled")
          }
        }}
        onDragStart={({ active }) => {
          const source = document.getElementById(`row-${active.id}`);
          setDragPreview(source ? createWordRowPreview(source) : null);
        }}
        onDragCancel={() => setDragPreview(null)}
        onDragEnd={({ active, over }) => {
          setDragPreview(null);
          if (
            over &&
            active.id !== over.id &&
            !locked &&
            !saving &&
            !uncertain &&
            !loadingItems &&
            !filter.trim()
          )
            move(String(active.id), String(over.id));
        }}
      >
        <fieldset
          disabled={saving || uncertain || loadingItems}
          className="space-y-4"
        >
          <SortableContext
            items={visible.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            {visible.map((row) => (
              <SortableWordRow
                key={row.id}
                id={row.id}
                index={rows.indexOf(row) + 1}
                total={rows.length}
                editable={!locked}
                disabled={
                  !!locked ||
                  saving ||
                  uncertain ||
                  loadingItems ||
                  !!filter.trim()
                }
                invalid={errorRow === row.id}
                onMove={(direction) =>
                  move(row.id, rows[rows.indexOf(row) + direction]!.id)
                }
                onRemove={() => {
                  if (
                    !window.confirm(
                      uiText(
                        "webWordlistEditor:delete_this_entry_and_its_notes"
                      )
                    )
                  )
                    return;
                  const next = rows.filter((r) => r.id !== row.id);
                  const target =
                    next[Math.min(rows.indexOf(row), next.length - 1)]!;
                  setRows(next);
                  setDirty(true);
                  setError("");
                  setErrorRow(null);
                  requestAnimationFrame(() =>
                    document.getElementById(`word-${target.id}`)?.focus()
                  );
                }}
              >
                <WordRow
                  row={row}
                  audio={audioByItem.get(rowKey(row))}
                  audioUnavailable={
                    originalIds.has(rowKey(row)) && !audio.isSuccess
                  }
                  stored={cache.get(rowKey(row))}
                  noteRevisionFor={noteRevisionFor}
                  invalidField={errorRow === row.id ? errorField : undefined}
                  locked={!!locked}
                  index={rows.indexOf(row) + 1}
                  change={(patch) => change(row.id, patch)}
                />
              </SortableWordRow>
            ))}
          </SortableContext>
        </fieldset>
        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay
              zIndex={40}
              dropAnimation={
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
                  ? null
                  : { duration: 180, easing: "ease-out" }
              }
            >
              {dragPreview && <WordRowDragPreview snapshot={dragPreview} />}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
      {!loadingItems && (
        <p className="mt-4 text-right text-xs tabular-nums text-foreground-muted">
          {uiText("webWordlistEditor:v0_entries_in_total", { v0: rows.length })}
        </p>
      )}
      <Pager page={currentPage} total={pages} onChange={setPage} />
    </PageShell>
  );
}
function WordRow({
  row,
  audio,
  audioUnavailable,
  stored,
  noteRevisionFor,
  invalidField,
  locked,
  index,
  change
}: {
  row: Row;
  audio?: WordlistCustomAudio;
  audioUnavailable: boolean;
  stored?: MyWordlistItem;
  noteRevisionFor: (entryId: string) => number | undefined;
  invalidField?: RowField;
  locked: boolean;
  index: number;
  change: (patch: Partial<Row>) => void;
}) {
  const uiText = useWebText(webWordlist);
  const userId = useUserStore((s) => s.user?.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [composing, setComposing] = useState(false);
  const text =
    row.customWord?.word ??
    row.text ??
    stored?.entry?.label ??
    stored?.entry_label ??
    (stored ? "内容不可用" : row.entryId ? "正在读取词条…" : "");
  const hasSourceText =
    row.customWord?.word != null ||
    row.text != null ||
    stored?.entry?.label != null ||
    stored?.entry_label != null;
  const [searchText, setSearchText] = useState(text);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setSearchText(text), 250);
    return () => clearTimeout(timer);
  }, [text, composing]);
  const search = useQuery({
    queryKey: [...wordListKeys.mine(userId), "suggestions", searchText],
    enabled:
      !row.entryId &&
      !row.customWord &&
      !composing &&
      searchText.trim().length > 0 &&
      searchText === text,
    queryFn: ({ signal }) =>
      api.wordList.suggestions({ q: searchText }, { signal })
  });
  const suggestions =
    !row.entryId &&
    !row.customWord &&
    !composing &&
    !dismissed &&
    searchText === text
      ? (search.data?.items ?? [])
      : [];
  function selectCandidate(candidate: WordlistCandidate) {
    change({
      entryId: candidate.entry_id,
      text: candidate.label,
      candidate,
      customWord: undefined,
      itemId: undefined,
      noteRevision:
        row.noteVersions?.[candidate.entry_id] ??
        noteRevisionFor(candidate.entry_id)
    });
    setDismissed(true);
    inputRef.current?.focus();
  }
  function focusCandidate(index: number) {
    const candidate = suggestions[index];
    if (candidate)
      document
        .getElementById(`candidate-${row.id}-${candidate.entry_id}`)
        ?.focus();
  }
  const authorNote = row.authorNote ?? stored?.author_note ?? "";
  const showAuthorNote = noteOpen || !!authorNote;
  const hasPrivateNote = !!(stored?.private_note || row.note || row.noteDirty);
  const note = row.note ?? stored?.private_note ?? "";
  const unloaded =
    rowKey(row) &&
    (row.noteRevision ?? noteRevisionFor(rowKey(row))) === undefined;
  return (
    <section className="min-w-0 px-4 pb-4 sm:px-5 sm:pb-5">
      <Input
        id={`word-${row.id}`}
        ref={inputRef}
        aria-label={uiText("webWordlistEditor:entry_v0", { v0: index })}
        aria-invalid={invalidField === "word"}
        aria-describedby={
          invalidField === "word" ? "wordlist-save-error" : undefined
        }
        className="tsz-words mt-1"
        value={
          hasSourceText
            ? text
            : stored
              ? uiText("webWordlistEditor:content_unavailable")
              : row.entryId
                ? uiText("webWordlistEditor:loading_entries_2")
                : ""
        }
        disabled={locked}
        placeholder={uiText("webWordlistEditor:enter_a_word_or_phrase")}
        maxLength={row.customWord ? 50 : undefined}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(e) => {
          if (composing || e.nativeEvent.isComposing || e.keyCode === 229)
            return;
          if (e.key === "ArrowDown" && suggestions.length) {
            e.preventDefault();
            focusCandidate(0);
          } else if (e.key === "ArrowUp" && suggestions.length) {
            e.preventDefault();
            focusCandidate(suggestions.length - 1);
          } else if (e.key === "Enter" && suggestions.length === 1) {
            e.preventDefault();
            selectCandidate(suggestions[0]!);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
          }
        }}
        onChange={(e) => {
          setDismissed(false);
          if (row.customWord) {
            change({
              customWord: { ...row.customWord, word: e.target.value },
              generateAudio: false
            });
            return;
          }
          change({
            text: e.target.value,
            entryId: null,
            candidate: undefined,
            noteRevision: row.noteRevision ?? stored?.note_revision,
            noteVersions: row.entryId
              ? {
                  ...row.noteVersions,
                  [row.entryId]:
                    row.noteRevision ?? noteRevisionFor(row.entryId)
                }
              : row.noteVersions,
            note: row.note ?? stored?.private_note ?? "",
            authorNote: row.authorNote ?? stored?.author_note ?? ""
          });
        }}
      />
      {!row.entryId &&
        !row.customWord &&
        !composing &&
        !dismissed &&
        searchText === text &&
        search.isFetching && (
          <p role="status" className="mt-2 text-sm text-foreground-muted">
            {uiText("webWordlistEditor:searching")}
          </p>
        )}
      {!row.entryId &&
        !row.customWord &&
        !composing &&
        !dismissed &&
        searchText === text &&
        search.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {uiText(
              "webWordlistEditor:search_failed_try_entering_your_search_again"
            )}
          </p>
        )}
      {suggestions.length > 0 && (
        <div
          aria-label={uiText("webWordlistEditor:candidate_entries")}
          className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1"
        >
          {suggestions.map((candidate, candidateIndex) => (
            <Button
              id={`candidate-${row.id}-${candidate.entry_id}`}
              type="button"
              variant="ghost"
              key={candidate.entry_id}
              className="h-auto min-h-11 w-full justify-start rounded-lg whitespace-normal px-3 py-2.5 text-left"
              onClick={() => selectCandidate(candidate)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  focusCandidate(
                    Math.min(candidateIndex + 1, suggestions.length - 1)
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (candidateIndex === 0) inputRef.current?.focus();
                  else focusCandidate(candidateIndex - 1);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissed(true);
                  inputRef.current?.focus();
                }
              }}
            >
              <span className="tsz-words min-w-0 break-words font-medium">
                {candidate.label}
              </span>
              <span className="ml-3 min-w-0 break-words text-sm font-normal text-foreground-muted">
                {candidate.glosses.join("；")}
              </span>
            </Button>
          ))}
        </div>
      )}
      {!row.entryId &&
        !row.customWord &&
        !composing &&
        !dismissed &&
        searchText === text &&
        search.isSuccess &&
        !search.isFetching &&
        search.data.items.length === 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
            <span>{uiText("webWordlistEditor:no_matching_entries_2")}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={locked}
              onClick={() => {
                change({
                  itemId: crypto.randomUUID(),
                  noteRevision: 1,
                  customWord: { word: text, definition: "" }
                });
                requestAnimationFrame(() =>
                  document.getElementById(`definition-${row.id}`)?.focus()
                );
              }}
            >
              {uiText("webWordlistEditor:create_custom_entry")}
            </Button>
          </div>
        )}
      {row.customWord && (
        <div className="mt-4">
          <label className="block text-sm font-medium">
            {uiText("webWordlistEditor:custom_definition_required")}
            <textarea
              className={cn(field, "mt-2")}
              id={`definition-${row.id}`}
              aria-label={uiText("webWordlistEditor:custom_definition_v0", {
                v0: index
              })}
              aria-invalid={invalidField === "definition"}
              aria-describedby={
                invalidField === "definition"
                  ? "wordlist-save-error"
                  : undefined
              }
              maxLength={200}
              disabled={locked}
              value={row.customWord.definition}
              placeholder={uiText(
                "webWordlistEditor:enter_the_entry_s_definition"
              )}
              onChange={(event) =>
                change({
                  customWord: {
                    ...row.customWord!,
                    definition: event.target.value
                  }
                })
              }
            />
          </label>
          <p className="mt-2 text-xs text-foreground-muted">
            {uiText(
              "webWordlistEditor:custom_entries_can_be_read_and_used_for_spelling_practice"
            )}
          </p>
          {audio &&
            (audio.word === wordlistAudioWord(row.customWord.word) ||
              audio.status === "refunding") && (
              <p className="mt-2 text-sm text-foreground-muted">
                {uiText(audioStatusMessages[audio.status])}
              </p>
            )}
          {!locked &&
            !(
              audio &&
              (audio.status === "refunding" ||
                (audio.word === wordlistAudioWord(row.customWord.word) &&
                  audio.status !== "refunded"))
            ) && (
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label={uiText(
                    "webWordlistEditor:generate_audio_for_v0",
                    { v0: index }
                  )}
                  checked={!!row.generateAudio}
                  disabled={audioUnavailable && !row.generateAudio}
                  onChange={(event) =>
                    change({ generateAudio: event.target.checked })
                  }
                />
                {audio?.status === "refunded"
                  ? uiText(
                      "webWordlistEditor:regenerate_british_and_american_audio_2"
                    )
                  : uiText(
                      "webWordlistEditor:generate_british_and_american_audio_2"
                    )}
              </label>
            )}
        </div>
      )}
      {(row.candidate || (row.entryId && stored?.entry)) && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-muted/70 px-4 py-2.5 text-sm leading-6 text-foreground-muted">
          {(row.candidate?.glosses ?? glosses(stored?.entry)).join("；")}
        </p>
      )}
      {stored && !stored.entry && !stored.custom_word && (
        <p className="mt-3 text-sm text-danger">
          {uiText("webWordlistEditor:content_unavailable")}
          {stored.unavailable_reason
            ? `（${uiText(unavailableReasonMessages[stored.unavailable_reason])}）`
            : ""}
          {uiText("webWordlistEditor:delete_or_replace_this_item")}
        </p>
      )}
      <div
        className={cn(
          "mt-3 grid gap-4",
          hasPrivateNote && showAuthorNote && "lg:grid-cols-2"
        )}
      >
        {showAuthorNote ? (
          <div className="min-w-0 text-sm font-medium">
            <label htmlFor={`author-note-${row.id}`}>
              {uiText("webWordlistEditor:note_2")}
            </label>
            <textarea
              className={cn(field, "mt-2")}
              id={`author-note-${row.id}`}
              aria-label={uiText("webWordlistEditor:note_v0", { v0: index })}
              aria-invalid={invalidField === "author-note"}
              aria-describedby={
                invalidField === "author-note"
                  ? `wordlist-save-error author-note-${row.id}-message`
                  : `author-note-${row.id}-message`
              }
              maxLength={1000}
              disabled={locked}
              placeholder={uiText(
                "webWordlistEditor:additional_information_for_readers"
              )}
              value={authorNote}
              onChange={(e) => {
                setNoteOpen(true);
                change({ authorNote: e.target.value });
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-foreground-muted">
              <span id={`author-note-${row.id}-message`}>
                {uiText("webWordlistEditor:published_with_the_word_list")}
              </span>
              {!authorNote && !locked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-3 text-xs"
                  aria-label={uiText(
                    "webWordlistEditor:collapse_notes_for_v0",
                    { v0: index }
                  )}
                  onClick={() => {
                    setNoteOpen(false);
                    requestAnimationFrame(() =>
                      document.getElementById(`add-note-${row.id}`)?.focus()
                    );
                  }}
                >
                  {uiText("webWordlistEditor:collapse")}
                </Button>
              )}
            </div>
          </div>
        ) : !locked ? (
          <Button
            id={`add-note-${row.id}`}
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 justify-self-start px-3"
            onClick={() => {
              setNoteOpen(true);
              requestAnimationFrame(() =>
                document.getElementById(`author-note-${row.id}`)?.focus()
              );
            }}
          >
            <Pencil className="size-4" aria-hidden />
            {uiText("webWordlistEditor:add_note")}
          </Button>
        ) : null}
        {hasPrivateNote && (
          <label className="block min-w-0 text-sm font-medium">
            {uiText(
              "webWordlistEditor:existing_private_note_visible_only_to_you"
            )}
            <textarea
              className={cn(field, "mt-2")}
              id={`private-note-${row.id}`}
              aria-label={uiText("webWordlistEditor:private_note_v0", {
                v0: index
              })}
              aria-invalid={invalidField === "private-note"}
              aria-describedby={
                invalidField === "private-note"
                  ? "wordlist-save-error"
                  : undefined
              }
              maxLength={1000}
              disabled={!!unloaded}
              placeholder={
                unloaded
                  ? uiText("webWordlistEditor:loading_notes")
                  : uiText("webWordlistEditor:visible_only_to_you")
              }
              value={note}
              onChange={(e) =>
                change({
                  note: e.target.value,
                  noteDirty: true,
                  noteRevision: row.noteRevision ?? noteRevisionFor(rowKey(row))
                })
              }
            />
          </label>
        )}
      </div>
    </section>
  );
}
