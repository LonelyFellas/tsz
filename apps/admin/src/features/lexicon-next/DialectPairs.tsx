import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NextDialectSense, NextDialectUsage, NextDraft } from "@tsz/types";
import { Alert, Button, Space } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { useAuthStore } from "@/lib/auth";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { dialectHeadword, generalSense } from "./model";
import { entrySenseChoice } from "./entrySenseChoice";

const usageKeys = [
  { value: "general", label: "common" },
  { value: "en-GB", label: "dialect_pair_gb" },
  { value: "en-US", label: "dialect_pair_us" }
] as const;
export function DialectPreview({
  row,
  locale,
  medium,
  draft,
  published = false,
  editing = false
}: {
  row?: NextDialectSense;
  locale: string;
  medium: string;
  draft: NextDraft;
  published?: boolean;
  editing?: boolean;
}) {
  const { t } = useLexiconEditorTranslation();
  if (!row || row.usage === "general") return null;
  const other = row.usage === "en-GB" ? "en-US" : "en-GB";
  const peer = row.target;
  const headword = dialectHeadword(draft, row.sense_id, row.usage);
  const params = new URLSearchParams({
    target_locale: other,
    medium_locale: medium,
    [published ? "published_sense" : "sense"]: peer?.sense_id ?? ""
  });
  return (
    <p>
      {t(usageKeys.find((u) => u.value === row.usage)!.label)} ·{" "}
      {peer ? (
        <>
          {locale === row.usage ? <strong>{headword}</strong> : headword} ↔{" "}
          {locale === other ? <strong>{peer.headword}</strong> : peer.headword}
          {editing &&
            [peer.part_of_speech, peer.gloss].filter(Boolean).length > 0 &&
            `（${[peer.part_of_speech, peer.gloss].filter(Boolean).join(" · ")}）`}{" "}
          <a
            href={`/lexicon-next/${peer.entry_id}?${params}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("dialect_pair_open")}
          </a>
        </>
      ) : row.paired ? (
        t("dialect_pair_inactive")
      ) : row.no_equivalent ? (
        `${t("dialect_pair_none")}${row.note ? "：" + row.note : ""}`
      ) : (
        t("dialect_pair_pending")
      )}
    </p>
  );
}

function PairPicker({
  entryId,
  medium,
  row,
  requests,
  onPick,
  onClose
}: {
  entryId: string;
  medium: string;
  row: NextDialectSense;
  requests: LexiconNextRequests;
  onPick: (r: NextDialectSense) => void;
  onClose: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const actor = useAuthStore((s) => s.profile?.id);
  const [query, setQuery] = useState("");
  const [entry, setEntry] = useState<string>();
  const [sense, setSense] = useState<string>();
  const [page, setPage] = useState(1);
  const results = useQuery({
    queryKey: ["admin-lexicon-next", "pair-search", actor, medium, query, page],
    enabled: !!query.trim(),
    queryFn: () =>
      requests.workspaceList({
        target_language: "en",
        medium_locale: medium,
        headword: query.trim(),
        page,
        page_size: 20
      }),
    retry: false
  });
  const candidate = useQuery({
    queryKey: ["admin-lexicon-next", "pair-candidate", actor, entry],
    enabled: !!entry,
    queryFn: () => requests.get(entry!),
    retry: false
  });
  const opposite = row.usage === "en-GB" ? "en-US" : "en-GB";
  const choices =
    candidate.data && entrySenseChoice(candidate.data, opposite, medium);
  const options =
    choices?.senses
      .filter((s) =>
        candidate.data?.dialect_senses?.some(
          (d) => d.sense_id === s.sense_id && d.usage === opposite
        )
      )
      .map((s) => {
        const occupied = candidate.data?.dialect_senses?.find(
          (d) => d.sense_id === s.sense_id
        )?.paired;
        const pos = candidate.data?.draft.senses.find(
          (v) => v.id === s.sense_id
        )?.part_of_speech;
        return {
          value: s.sense_id,
          label: [
            pos,
            s.gloss || t("dialect_pair_missing"),
            occupied ? t("dialect_pair_occupied") : ""
          ]
            .filter(Boolean)
            .join(" · "),
          disabled: occupied
        };
      }) ?? [];
  const selected = options.find((o) => o.value === sense && !o.disabled);
  return (
    <Space wrap>
      <Input
        type="search"
        aria-label={t("dialect_pair_search")}
        placeholder={t("dialect_pair_spelling")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
          setEntry(undefined);
          setSense(undefined);
        }}
      />
      <Select
        aria-label={t("dialect_pair_entry")}
        placeholder={t("dialect_pair_choose_entry")}
        value={entry}
        loading={results.isFetching}
        options={(results.data?.items ?? [])
          .filter((e) => e.id !== entryId && e.status !== "archived")
          .map((e) => ({
            value: e.id,
            label: [e.headword, e.gloss].filter(Boolean).join(" · ")
          }))}
        onChange={(id: string) => {
          setEntry(id);
          setSense(undefined);
        }}
      />
      {(results.data?.pagination.total_pages ?? 0) > 1 && (
        <>
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t("dialect_pair_previous")}
          </Button>
          <Button
            disabled={page >= results.data!.pagination.total_pages}
            onClick={() => setPage(page + 1)}
          >
            {t("dialect_pair_next")}
          </Button>
        </>
      )}
      {entry && (
        <Select
          aria-label={t("dialect_pair_sense")}
          placeholder={t("dialect_pair_opposite")}
          value={sense}
          loading={candidate.isFetching}
          options={options}
          onChange={setSense}
        />
      )}
      {candidate.data && !options.length && (
        <span>{t("dialect_pair_mark")}</span>
      )}
      {(results.isError || candidate.isError) && (
        <Alert
          type="error"
          title={t("dialect_pair_load_error")}
          action={
            <Button
              onClick={() =>
                void (results.isError ? results : candidate).refetch()
              }
            >
              {t("retry")}
            </Button>
          }
        />
      )}
      <Button
        disabled={!selected || !candidate.data || !choices}
        onClick={() => {
          if (!selected || !candidate.data || !choices) return;
          const s = candidate.data.draft.senses.find(
            (s) => s.id === selected.value
          )!;
          onPick({
            ...row,
            paired: true,
            no_equivalent: false,
            note: "",
            target: {
              entry_id: candidate.data.id,
              sense_id: s.id,
              revision: candidate.data.revision,
              headword: dialectHeadword(candidate.data.draft, s.id, opposite),
              part_of_speech: s.part_of_speech,
              gloss:
                choices.senses.find((c) => c.sense_id === s.id)?.gloss ?? ""
            }
          });
          onClose();
        }}
      >
        {t("dialect_pair_use")}
      </Button>
      <Button onClick={onClose}>{t("cancel")}</Button>
    </Space>
  );
}
export function DialectEditor({
  row,
  entryId,
  medium,
  draft,
  disabled,
  requests,
  onChange
}: {
  row: NextDialectSense;
  entryId: string;
  medium: string;
  draft: NextDraft;
  disabled: boolean;
  requests: LexiconNextRequests;
  onChange: (r: NextDialectSense) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const [choosing, setChoosing] = useState(false);
  return (
    <div>
      <Space wrap>
        <span>{t("dialect_pair_usage")}</span>
        <Select
          aria-label={t("dialect_pair_usage")}
          value={row.usage}
          options={usageKeys.map((u) => ({ ...u, label: t(u.label) }))}
          disabled={disabled}
          onChange={(usage: NextDialectUsage) => {
            if (usage === row.usage) return;
            setChoosing(false);
            onChange({ ...generalSense(row.sense_id), usage });
          }}
        />
        {row.usage !== "general" && (
          <>
            <Select
              aria-label={t("dialect_pair_equivalent")}
              value={
                row.paired ? "paired" : row.no_equivalent ? "none" : "pending"
              }
              disabled={disabled}
              options={[
                { value: "pending", label: t("dialect_pair_pending") },
                ...(row.paired
                  ? [{ value: "paired", label: t("dialect_pair_paired") }]
                  : []),
                { value: "none", label: t("dialect_pair_none") }
              ]}
              onChange={(v: string) => {
                if (v === "paired" || (row.no_equivalent && v === "none"))
                  return;
                onChange({
                  ...row,
                  no_equivalent: v === "none",
                  note: "",
                  target: null,
                  paired: false
                });
                setChoosing(false);
              }}
            />
            <Button disabled={disabled} onClick={() => setChoosing(true)}>
              {row.paired
                ? t("dialect_pair_replace")
                : t("dialect_pair_choose")}
            </Button>
            {row.paired && (
              <Button
                disabled={disabled}
                onClick={() => {
                  onChange({ ...row, paired: false, target: null });
                  setChoosing(false);
                }}
              >
                {t("dialect_pair_unlink")}
              </Button>
            )}
          </>
        )}
      </Space>
      {row.no_equivalent && (
        <Input
          aria-label={t("dialect_pair_reason")}
          placeholder={t("dialect_pair_optional")}
          maxLength={1000}
          disabled={disabled}
          value={row.note}
          onChange={(e) => onChange({ ...row, note: e.target.value })}
        />
      )}
      {row.paired && (
        <DialectPreview
          row={row}
          medium={medium}
          locale={row.usage}
          draft={draft}
          editing
        />
      )}
      {choosing && !disabled && row.usage !== "general" && (
        <PairPicker
          requests={requests}
          entryId={entryId}
          medium={medium}
          row={row}
          onPick={onChange}
          onClose={() => setChoosing(false)}
        />
      )}
    </div>
  );
}
