import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { useAuthStore } from "@/lib/auth";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { useFormTypeLabel } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { nextTargetChoices, type NextTargetChoice } from "./nextTargetChoices";

export function NextTargetPicker({
  literal,
  targetLocale,
  mediumLocale,
  requests,
  onSelect,
  onCancel,
  componentWords = false,
  selfEntryId
}: {
  literal: string;
  targetLocale: string;
  mediumLocale: string;
  requests: LexiconNextRequests;
  onSelect: (choice: NextTargetChoice) => void;
  onCancel?: () => void;
  componentWords?: boolean;
  selfEntryId?: string;
}) {
  const { t } = useLexiconEditorTranslation();
  const actor = useAuthStore((state) => state.profile?.id);
  const formTypeLabel = useFormTypeLabel();
  const posLabel = usePartOfSpeechLabel();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>();
  const matches = useQuery({
    queryKey: [
      "admin-lexicon-next",
      "target-entries",
      actor,
      literal,
      mediumLocale,
      componentWords,
      page
    ],
    queryFn: () =>
      requests.matchEntries(
        {
          target_language: "en",
          medium_locale: mediumLocale,
          surface: literal,
          page,
          page_size: 20
        },
        undefined,
        componentWords
      ),
    retry: false
  });
  const entries =
    matches.data?.items.filter((item) => item.id !== selfEntryId) ?? [];
  const selection =
    entries.find((entry) => entry.id === selectedId) ??
    (entries.length === 1 ? entries[0] : undefined);
  const selectedEntry = useQuery({
    queryKey: ["admin-lexicon-next", "target-entry", actor, selection?.id],
    queryFn: () => requests.get(selection!.id),
    enabled: !!selection,
    retry: false
  });
  const choices = selectedEntry.data
    ? nextTargetChoices(
        selectedEntry.data,
        literal,
        targetLocale,
        mediumLocale,
        componentWords
      )
    : [];
  const loading = matches.isPending || (!!selection && selectedEntry.isPending);
  const error = matches.error ?? selectedEntry.error;
  function movePage(next: number) {
    setSelectedId(undefined);
    setPage(next);
  }
  return (
    <Flex vertical gap="small">
      {!componentWords && (
        <Typography.Text className="tsz-words" strong>
          {literal}
        </Typography.Text>
      )}
      {loading && <Spin aria-label={t("next_component_searching")} />}
      {error && (
        <Alert
          type="error"
          title={error.message}
          action={
            <Button
              onClick={() =>
                void (matches.isError
                  ? matches.refetch()
                  : selectedEntry.refetch())
              }
            >
              {t("retry")}
            </Button>
          }
        />
      )}
      {!loading && !error && !entries.length && (
        <Empty description={t("target_no_matches")} />
      )}
      {entries.length > 1 && (
        <Flex gap="small" wrap>
          {entries.map((entry) => (
            <Button
              key={entry.id}
              aria-pressed={entry.id === selection?.id}
              onClick={() => setSelectedId(entry.id)}
            >
              <span className="tsz-words">{entry.headword}</span>
              {componentWords && entry.status === "draft" && (
                <Tag>{t("panel_draft")}</Tag>
              )}
            </Button>
          ))}
        </Flex>
      )}
      {!loading && !error && !!selection && !choices.length && (
        <Empty description={t("target_entry_no_choices")} />
      )}
      {choices.map((choice) => (
        <Button
          key={`${choice.target_base_form_id}:${choice.target_form_id}:${choice.target_variant_id}:${choice.target_sense_id}`}
          onClick={() => onSelect(choice)}
        >
          <span className="tsz-words">{choice.headword}</span>
          {choice.form_type && choice.part_of_speech
            ? ` · ${posLabel(choice.part_of_speech)} · ${formTypeLabel(choice.form_type)}`
            : ""}
          {choice.gloss ? ` · ${choice.gloss}` : ""}
          {componentWords &&
            entries.length === 1 &&
            selection?.status === "draft" && <Tag>{t("panel_draft")}</Tag>}
        </Button>
      ))}
      {componentWords && (matches.data?.pagination.total_pages ?? 0) > 1 && (
        <Flex gap="small">
          <Button disabled={page === 1} onClick={() => movePage(page - 1)}>
            {t("next_component_previous_page")}
          </Button>
          <Button
            disabled={page >= matches.data!.pagination.total_pages}
            onClick={() => movePage(page + 1)}
          >
            {t("next_component_next_page")}
          </Button>
        </Flex>
      )}
      {onCancel && <Button onClick={onCancel}>取消</Button>}
    </Flex>
  );
}
