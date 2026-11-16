import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type {
  NextEntry,
  WordRelationWritableV3,
  WordSenseWritableV3
} from "@tsz/types";
import { Alert, Button } from "@tsz/ui/admin/display";
import { AdminControls } from "@tsz/ui/admin/context";
import { useAuthStore } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import type {
  RelatedSuggestionsSource,
  RelatedWordChoice
} from "@/features/dictionary/relatedSuggestions";
import { V3RelationsGrid } from "@/features/dictionary/word-creation-v3/components/V3RelationsGrid";
import { groupRelations } from "@/features/dictionary/word-creation-v3/relationGroups";
import { SenseSection } from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { relationLabel } from "@/features/dictionary/word-creation-v3/presentation";
import { draftForms } from "./model";

function choice(
  entry: NextEntry,
  target: string,
  medium: string
): RelatedWordChoice {
  const forms = draftForms(entry.draft);
  const headword =
    forms.find((row) => row.locale === target)?.text ||
    forms.find((row) => row.locale === "en")?.text ||
    entry.draft.headword;
  const senses = entry.draft.senses.map((sense) => ({
    sense_id: sense.id,
    gloss:
      sense.definitions.find((row) => row.locale === medium)?.text ||
      sense.equivalents.find((row) => row.locale === medium)?.text ||
      "",
    status: "draft" as const
  }));
  return {
    word_id: entry.id,
    headword,
    matchedHeadword: headword,
    status: "draft",
    senses,
    senseCount: senses.length,
    preview: senses
      .map((sense) => sense.gloss)
      .filter(Boolean)
      .join("；")
  };
}

function useTargets(
  rows: WordRelationWritableV3[],
  requests: LexiconNextRequests
) {
  const actor = useAuthStore((state) => state.profile?.id);
  const ids = [
    ...new Set(
      rows.flatMap((row) => (row.target_word_id ? [row.target_word_id] : []))
    )
  ];
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["admin-lexicon-next", "relation-target", actor, id],
      queryFn: () => requests.get(id),
      retry: false
    }))
  });
  return {
    entries: queries.flatMap((query) => (query.data ? [query.data] : [])),
    failed: queries.some((query) => query.isError),
    retry: () => {
      for (const query of queries) if (query.isError) void query.refetch();
    }
  };
}

export function Relations({
  rows,
  entryId,
  senseId,
  target,
  medium,
  requests,
  disabled,
  onChange
}: {
  rows: WordRelationWritableV3[];
  entryId: string;
  senseId: string;
  target: string;
  medium: string;
  requests: LexiconNextRequests;
  disabled: boolean;
  onChange: (
    update: (rows: WordRelationWritableV3[]) => WordRelationWritableV3[]
  ) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const actor = useAuthStore((state) => state.profile?.id);
  const targets = useTargets(rows, requests);
  const relatedSource: RelatedSuggestionsSource = {
    key: ["admin-lexicon-next", "relations", actor ?? "", target, medium],
    suggestions: async (query, exclude) => {
      const page = await requests.list({
        target_language: "en",
        medium_locale: medium,
        headword: query,
        page_size: 4
      });
      return Promise.all(
        page.items
          .filter((entry) => entry.id !== exclude)
          .slice(0, 3)
          .map(async (entry) =>
            choice(await requests.get(entry.id), target, medium)
          )
      );
    },
    senses: async (id) => ({
      entry_id: id,
      senses: choice(await requests.get(id), target, medium).senses
    })
  };
  const snapshots = Object.fromEntries(
    rows.flatMap((row) => {
      const entry = targets.entries.find(
        (entry) => entry.id === row.target_word_id
      );
      if (!entry) return [];
      const word = choice(entry, target, medium);
      return [
        [
          row.id,
          {
            headword: word.headword,
            gloss:
              word.senses.find(
                (sense) => sense.sense_id === row.target_sense_id
              )?.gloss ?? ""
          }
        ]
      ];
    })
  );
  const sense: WordSenseWritableV3 = {
    id: senseId,
    sub_pos: "",
    level: "A1",
    depends_on_context: false,
    definitions: [],
    sentences: [],
    relations: rows
  };
  return (
    <SenseSection
      label={t("related_words")}
      count={groupRelations(rows).length}
      unit="项"
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
    >
      {targets.failed && (
        <Alert
          type="error"
          title="关联词读取失败"
          action={<Button onClick={targets.retry}>重试</Button>}
        />
      )}
      <AdminControls componentDisabled={disabled}>
        <V3RelationsGrid
          key={`${target}:${medium}`}
          sense={sense}
          posIndex={0}
          senseIndex={0}
          currentWordId={entryId}
          relatedSource={relatedSource}
          relationDisplaySnapshots={snapshots}
          idFactory={() => crypto.randomUUID()}
          change={(mutation) => {
            if (disabled) return;
            onChange((current) => {
              const draft = {
                sense_groups: [],
                pos: [
                  {
                    pos_id: "relations",
                    grammar_structures: [],
                    senses: [{ ...sense, relations: structuredClone(current) }]
                  }
                ]
              };
              mutation(draft);
              return draft.pos[0]!.senses[0]!.relations;
            });
          }}
        />
      </AdminControls>
    </SenseSection>
  );
}

export function RelationsPreview({
  rows,
  target,
  medium,
  requests
}: {
  rows: WordRelationWritableV3[];
  target: string;
  medium: string;
  requests: LexiconNextRequests;
}) {
  const { t } = useLexiconEditorTranslation();
  const targets = useTargets(rows, requests);
  if (!rows.length) return null;
  return (
    <section aria-label={t("related_words")}>
      <h4>{t("related_words")}</h4>
      {targets.failed && (
        <Alert
          type="error"
          title="关联词读取失败"
          action={<Button onClick={targets.retry}>重试</Button>}
        />
      )}
      {(["derivative", "synonym", "antonym"] as const).map((kind) => {
        const group = rows.filter((row) => row.relation === kind);
        return group.length ? (
          <div key={kind}>
            <strong>{relationLabel(kind, t)}</strong>
            <ul>
              {group.map((row) => {
                const entry = targets.entries.find(
                  (entry) => entry.id === row.target_word_id
                );
                const word = entry && choice(entry, target, medium);
                const gloss =
                  word?.senses.find(
                    (sense) => sense.sense_id === row.target_sense_id
                  )?.gloss ?? row.pending_target_gloss;
                return (
                  <li key={row.id}>
                    <span className="tsz-words">
                      {word?.headword ??
                        row.pending_target_headword ??
                        "关联词读取中"}
                    </span>
                    {gloss && ` · ${gloss}`} · {row.score}%
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null;
      })}
    </section>
  );
}
