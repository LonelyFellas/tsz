import { useState } from "react";
import { Button, Empty, Flex, Typography } from "@tsz/ui/admin/display";
import { Popover } from "@tsz/ui/admin/overlays";
import type { NextPhraseComponentUsage } from "@tsz/types";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { SenseSection } from "@/features/dictionary/word-creation-v3/components/V3SenseSection";
import type { ResolvedTarget } from "@/features/dictionary/word-creation-v3/components/V3TargetCascader";
import { sentenceTokens } from "@/features/dictionary/word-creation-v3/tokens";
import { NextTargetPicker } from "./NextTargetPicker";
import "./phrase-components.css";

export function PhraseComponentWords({
  spelling,
  rows,
  requests,
  entryId,
  target,
  medium,
  disabled,
  onSelect
}: {
  spelling: string;
  rows: readonly NextPhraseComponentUsage[];
  requests?: LexiconNextRequests;
  entryId?: string;
  target: string;
  medium: string;
  disabled: boolean;
  onSelect: (literal: string, choice?: ResolvedTarget) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<number>();
  const tokens = sentenceTokens(spelling).map(({ text }) => text);
  const literals = [
    ...tokens,
    ...rows
      .map(({ usage }) => usage.literal)
      .filter((literal) => !tokens.includes(literal))
  ];
  return (
    <SenseSection
      label={t("component_words")}
      count={rows.length}
      unit={t("next_component_count_unit")}
      collapsed={collapsed}
      onToggle={() => {
        setOpen(undefined);
        setCollapsed(!collapsed);
      }}
    >
      {!literals.length ? (
        <Empty description={t("phrase_spelling_first")} />
      ) : (
        <Flex gap="small" wrap aria-label={t("phrase_words")}>
          {literals.map((literal, index) => {
            const row = rows.find(({ usage }) => usage.literal === literal);
            const selected =
              row?.usage.state === "resolved" ? row.usage : undefined;
            function choose(choice?: ResolvedTarget) {
              onSelect(literal, choice);
              setOpen(undefined);
            }
            return (
              <Popover
                key={`${index}:${literal}`}
                trigger="click"
                placement="bottomLeft"
                destroyOnHidden
                open={!disabled && open === index}
                onOpenChange={(visible) => {
                  if (visible) {
                    setOpen(index);
                  } else {
                    setOpen((current) =>
                      current === index ? undefined : current
                    );
                  }
                }}
                content={
                  open === index && !disabled ? (
                    <Flex vertical gap="small">
                      {selected && (
                        <Flex gap="small" wrap align="center">
                          <Typography.Text>
                            <span className="tsz-words">
                              {selected.target_headword}
                            </span>
                            {selected.target_gloss &&
                              ` · ${selected.target_gloss}`}
                          </Typography.Text>
                          <Button size="small" onClick={() => choose()}>
                            {t("panel_clear_link")}
                          </Button>
                        </Flex>
                      )}
                      {row?.target_source === "v3" && (
                        <Typography.Text type="secondary">
                          {t("next_component_legacy_link")}
                        </Typography.Text>
                      )}
                      {index >= tokens.length && (
                        <Typography.Text type="secondary">
                          {t("next_component_missing_literal")}
                        </Typography.Text>
                      )}
                      {index < tokens.length && requests && (
                        <NextTargetPicker
                          literal={literal}
                          targetLocale={target}
                          mediumLocale={medium}
                          requests={requests}
                          componentWords
                          selfEntryId={entryId}
                          onSelect={(choice) =>
                            choose({
                              state: "resolved",
                              target_word_id: choice.target_word_id,
                              target_pos_id: choice.target_pos_id,
                              target_base_form_id: choice.target_base_form_id,
                              target_form_id: choice.target_form_id,
                              target_variant_id: choice.target_variant_id,
                              target_sense_id: choice.target_sense_id,
                              target_dialect: choice.target_dialect,
                              target_form_type: choice.form_type ?? "base",
                              target_headword: choice.headword,
                              target_gloss: choice.gloss
                            })
                          }
                        />
                      )}
                    </Flex>
                  ) : null
                }
              >
                <Button
                  className="lexicon-next-component-word tsz-words"
                  aria-label={t("phrase_link_word", {
                    index: index + 1,
                    token: literal
                  })}
                  aria-pressed={!!selected}
                  disabled={disabled}
                  title={selected?.target_gloss}
                >
                  {literal}
                </Button>
              </Popover>
            );
          })}
        </Flex>
      )}
    </SenseSection>
  );
}

export function PhraseComponentSummary({
  rows
}: {
  rows: readonly NextPhraseComponentUsage[];
}) {
  const { t } = useLexiconEditorTranslation();
  if (!rows.length) return null;
  return (
    <div>
      <h3>{t("component_words")}</h3>
      <ul>
        {rows.map(({ usage }) => (
          <li key={usage.id}>
            <span className="tsz-words">{usage.literal}</span>
            {usage.state === "resolved" &&
              usage.target_gloss &&
              ` · ${usage.target_gloss}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
