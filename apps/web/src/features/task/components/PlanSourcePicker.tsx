"use client";
import {
  webCommon,
  localText,
  LocalWebError,
  type WebNotice,
  webErrorText
} from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LibrarySpace, Wordlist } from "@tsz/types";
import { Button, Input } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { LibraryDialog } from "@/features/wordlist/components/LibraryDialog";
import { PageNotice, Pager, Segmented } from "@/features/shell/Page";
export interface SelectedSource {
  wordlist: Wordlist;
  personalName?: string;
}
export function PlanSourcePicker({
  userId,
  selected,
  onConfirm,
  onClose
}: {
  userId: string;
  selected: SelectedSource[];
  onConfirm: (items: SelectedSource[]) => void;
  onClose: () => void;
}) {
  const uiText = useWebText(webTask);
  const [space, setSpace] = useState<LibrarySpace | "public">("owned");
  const [parent, setParent] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebNotice>("");
  const [nodes, setNodes] = useState<
    Record<string, { space: LibrarySpace; version: string; name: string }>
  >({});
  const library = useQuery({
    queryKey: ["plan-sources", userId, space, parent, search, page],
    enabled: space !== "public",
    queryFn: ({ signal }) =>
      api.wordList.library.list(
        space as LibrarySpace,
        { parent_id: parent, q: search, page, page_size: 20 },
        { signal }
      )
  });
  const publicLists = useQuery({
    queryKey: ["plan-sources", userId, "public", search, page],
    enabled: space === "public",
    queryFn: ({ signal }) =>
      api.wordList.list({ q: search, page, page_size: 20 }, { signal })
  });
  const data = space === "public" ? publicLists : library;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  const [expandedNotice, setExpandedNotice] = useState(false);
  const current = () =>
    !controller.current?.signal.aborted &&
    useUserStore.getState().user?.id === userId;
  function toggle(w: Wordlist, personalName?: string) {
    setError("");
    setDraft((old) =>
      old.some((s) => s.wordlist.id === w.id)
        ? old.filter((s) => s.wordlist.id !== w.id)
        : [...old, { wordlist: w, personalName }]
    );
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = new Map(draft.map((s) => [s.wordlist.id, s]));
      for (const s of ["owned", "favorites"] as const) {
        const chosen = Object.entries(nodes).filter(([, n]) => n.space === s);
        if (!chosen.length) continue;
        const versions = new Set(chosen.map(([, n]) => n.version));
        if (versions.size !== 1)
          throw new LocalWebError(
            localText(
              webTask,
              "webTask:the_directory_changed_cancel_the_folder_selection_and_select_again"
            )
          );
        const expanded = await api.wordList.library.selection(
          s,
          {
            expected_version: chosen[0]![1].version,
            node_ids: chosen.map(([id]) => id)
          },
          { signal: controller.current?.signal }
        );
        for (const w of expanded.wordlists) result.set(w.id, { wordlist: w });
      }
      if (result.size > 5)
        throw new LocalWebError(
          localText(
            webTask,
            "webTask:select_at_most_five_word_lists_reduce_your_selection"
          )
        );
      if (current()) {
        if (Object.keys(nodes).length) {
          setDraft([...result.values()]);
          setNodes({});
          setExpandedNotice(true);
        } else onConfirm([...result.values()]);
      }
    } catch (e) {
      if (current())
        setError(
          webErrorText(
            e,
            localText(webTask, "webTask:could_not_select_try_again")
          )
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <LibraryDialog
      title={uiText("webTask:choose_word_lists")}
      busy={busy}
      onClose={onClose}
    >
      <div className="space-y-5">
        <Segmented
          label={uiText("webTask:word_list_sources")}
          value={space}
          options={[
            { value: "owned", label: uiText("webTask:created_by_me") },
            { value: "favorites", label: uiText("webTask:my_favourites") },
            { value: "public", label: uiText("webTask:public_word_lists") }
          ]}
          onChange={(s) => {
            setSpace(s);
            setParent(undefined);
            setPage(1);
            setSearch("");
          }}
        />
        <Input
          aria-label={uiText("webTask:search_word_lists_or_folders")}
          value={search}
          disabled={busy}
          placeholder={uiText("webTask:search_word_lists_or_folders")}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {space !== "public" && (
          <nav
            aria-label={uiText("webTask:word_list_directory")}
            className="flex flex-wrap gap-2 text-sm"
          >
            <button
              type="button"
              onClick={() => {
                setParent(undefined);
                setPage(1);
              }}
            >
              {uiText("webTask:root_folder")}
            </button>
            {library.data?.ancestors.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  setParent(c.id);
                  setPage(1);
                }}
              >
                {" "}
                / {c.name}
              </button>
            ))}
          </nav>
        )}
        {data.isError ? (
          <PageNotice tone="error">
            {data.error instanceof Error
              ? uiText(
                  webErrorText(
                    data.error,
                    localText(webCommon, "webCommon:response_unavailable")
                  )
                )
              : uiText("webTask:could_not_load")}
            <Button variant="link" onClick={() => void data.refetch()}>
              {uiText("webTask:retry")}
            </Button>
          </PageNotice>
        ) : data.isPending ? (
          <PageNotice>{uiText("webTask:loading_word_lists")}</PageNotice>
        ) : (
          <ul className="space-y-3">
            {space === "public"
              ? publicLists.data?.items.map((w) => (
                  <li key={w.id}>
                    <SourceChoice
                      item={{ wordlist: w }}
                      checked={draft.some((s) => s.wordlist.id === w.id)}
                      disabled={busy}
                      toggle={() => toggle(w)}
                    />
                  </li>
                ))
              : library.data?.items.map((n) => (
                  <li key={n.id}>
                    {n.wordlist_id === null ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                        <input
                          type="checkbox"
                          aria-label={uiText("webTask:select_folder_v0", {
                            v0: n.name
                          })}
                          checked={!!nodes[n.id]}
                          disabled={busy}
                          onChange={() =>
                            setNodes((old) => {
                              const next = { ...old };
                              if (next[n.id]) delete next[n.id];
                              else
                                next[n.id] = {
                                  space: space as LibrarySpace,
                                  version: library.data!.version,
                                  name: n.name
                                };
                              return next;
                            })
                          }
                        />
                        <button
                          type="button"
                          className="min-h-10 min-w-0 flex-1 text-left"
                          onClick={() => {
                            setParent(n.id);
                            setSearch("");
                            setPage(1);
                          }}
                        >
                          {uiText("webTask:folder_v0", { v0: n.name })}
                        </button>
                      </div>
                    ) : n.wordlist ? (
                      <SourceChoice
                        item={{ wordlist: n.wordlist, personalName: n.name }}
                        checked={draft.some(
                          (s) => s.wordlist.id === n.wordlist_id
                        )}
                        disabled={busy}
                        toggle={() => toggle(n.wordlist!, n.name)}
                      />
                    ) : (
                      <p className="text-sm text-foreground-muted">
                        {uiText("webTask:v0_source_unavailable", {
                          v0: n.name
                        })}
                      </p>
                    )}
                  </li>
                ))}
          </ul>
        )}
        {data.data && (
          <Pager
            page={page}
            total={data.data.pagination.total_pages}
            disabled={busy}
            onChange={setPage}
          />
        )}
        {draft.length > 0 && (
          <section
            aria-label={uiText("webTask:word_lists_to_confirm")}
            className="space-y-2"
          >
            <h3 className="text-sm font-medium">
              {uiText("webTask:word_lists_to_confirm")}
            </h3>
            <ul className="space-y-2">
              {draft.map((s) => (
                <li
                  key={s.wordlist.id}
                  className="flex items-start gap-3 rounded-2xl bg-muted/70 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm">
                      {s.wordlist.name}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {uiText("webTask:v0_v1_entries", {
                        v0: s.wordlist.owner_name,
                        v1: s.wordlist.item_count
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={uiText("webTask:deselect_v0", {
                      v0: s.wordlist.name
                    })}
                    onClick={() =>
                      setDraft((old) =>
                        old.filter((i) => i.wordlist.id !== s.wordlist.id)
                      )
                    }
                  >
                    {uiText("webTask:remove")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {expandedNotice && (
          <p role="status" className="text-sm text-foreground-muted">
            {uiText(
              "webTask:folders_expanded_check_the_word_lists_and_confirm_your_selection_again"
            )}
          </p>
        )}
        <p className="text-sm text-foreground-muted">
          {uiText("webTask:selected_word_lists_v0", { v0: draft.length })}
          {Object.keys(nodes).length > 0 &&
            uiText("webTask:with_v0_more_folders_to_expand", {
              v0: Object.keys(nodes).length
            })}
          {uiText(
            "webTask:confirmation_expands_all_subfolders_and_removes_duplicates_up_to_five_li"
          )}
        </p>
        {Object.entries(nodes).map(([id, n]) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            onClick={() =>
              setNodes((old) => {
                const next = { ...old };
                delete next[id];
                return next;
              })
            }
          >
            {uiText("webTask:remove_folder_v0", { v0: n.name })}
          </Button>
        ))}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {uiText(error)}
          </p>
        )}
        <div className="sticky bottom-0 flex justify-end gap-3 bg-surface py-3">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {uiText("webTask:cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void confirm()}>
            {busy
              ? uiText("webTask:expanding")
              : uiText("webTask:confirm_selection")}
          </Button>
        </div>
      </div>
    </LibraryDialog>
  );
}
export function SourceChoice({
  item,
  checked,
  disabled,
  toggle
}: {
  item: SelectedSource;
  checked: boolean;
  disabled: boolean;
  toggle: () => void;
}) {
  const uiText = useWebText(webTask);
  const w = item.wordlist;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
      <input
        className="mt-1"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={toggle}
      />
      <span className="min-w-0">
        <span className="line-clamp-2 break-words font-medium">{w.name}</span>
        {item.personalName && item.personalName !== w.name && (
          <span className="block text-sm text-foreground-muted">
            {uiText("webTask:note_v0_2", { v0: item.personalName })}
          </span>
        )}
        <span className="mt-1 block text-xs text-foreground-muted">
          {w.owner_name} ·{" "}
          {w.state === "published"
            ? uiText("webTask:public")
            : uiText("webTask:private")}{" "}
          {uiText("webTask:v0_entries_3", { v0: w.item_count })}
        </span>
      </span>
    </label>
  );
}
