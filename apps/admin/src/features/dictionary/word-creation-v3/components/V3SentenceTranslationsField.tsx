import Delete from "@mui/icons-material/Delete";
import Add from "@mui/icons-material/Add";
import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField
} from "@mui/material";
import { useState } from "react";
import type {
  SentenceTranslationBandV3,
  TranslationLanguageV3,
  WordSentenceTranslationV3,
  WordSentenceWritableV3
} from "@tsz/types";
import { newWordNodeId } from "../../word-model/primitives";
import {
  DEFAULT_SENTENCE_TRANSLATION_LANGUAGE,
  replaceRichText,
  sentenceTranslationsV3
} from "../meaningsModel";
import "./V3SentenceTranslationsField.css";
const TIERS = [
  {
    key: "word_for_word",
    label: "初阶",
    name: "初阶",
    short: "初",
    hint: "逐字直译; Word-for-Word"
  },
  {
    key: "balanced_fluency",
    label: "中阶",
    name: "中阶",
    short: "中",
    hint: "语句通顺; Balanced Fluency"
  },
  {
    key: "adapted_creation",
    label: "高阶",
    name: "高阶",
    short: "高",
    hint: "深层重构; Adapted Creation"
  }
] as const;
const LANGUAGE_LABELS: Record<TranslationLanguageV3, string> = { zh: "汉语" };
export function V3SentenceTranslationsField({
  sentence,
  index,
  disabled,
  onChange
}: {
  sentence: WordSentenceWritableV3;
  index: number;
  disabled?: boolean;
  onChange: (translations: WordSentenceTranslationV3[]) => void;
}) {
  const rows = sentenceTranslationsV3(sentence),
    language = rows[0]?.language ?? DEFAULT_SENTENCE_TRANSLATION_LANGUAGE;
  const [menu, setMenu] = useState<{
    anchor: HTMLElement;
    kind: "language" | "tier" | "add";
    id?: string;
  }>();
  const chooseTier = (band: SentenceTranslationBandV3) => {
    if (!menu || disabled) return;
    if (menu.kind === "add")
      onChange([
        ...rows,
        {
          id: newWordNodeId(),
          band,
          language,
          content: { version: 2, text: "", annotations: [] }
        }
      ]);
    else
      onChange(
        rows.map((item) => (item.id === menu.id ? { ...item, band } : item))
      );
    setMenu(undefined);
  };
  return (
    <div className="word-sentence-translation-list">
      <Button
        disabled={disabled}
        className="word-sentence-translation-label"
        aria-label={`例句 ${index + 1} 译文语言`}
        onClick={(event) =>
          setMenu({ anchor: event.currentTarget, kind: "language" })
        }
      >
        {LANGUAGE_LABELS[language]}译文
      </Button>
      <div className="word-sentence-translation-groups">
        {TIERS.map((tier) => {
          const groupRows = rows
            .map((translation, translationIndex) => ({
              translation,
              translationIndex
            }))
            .filter(({ translation }) => translation.band === tier.key);
          if (!groupRows.length) return null;
          return (
            <div
              className="word-sentence-translation-group"
              role="group"
              aria-label={`例句 ${index + 1} ${tier.name}译文组`}
              key={tier.key}
            >
              {groupRows.map(({ translation, translationIndex }) => (
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="flex-start"
                  className="word-sentence-translation-item"
                  key={translation.id}
                >
                  <Button
                    disabled={disabled}
                    className="word-sentence-translation-band-button"
                    aria-label={`例句 ${index + 1} 译文 ${translationIndex + 1} 风格`}
                    onClick={(event) =>
                      setMenu({
                        anchor: event.currentTarget,
                        kind: "tier",
                        id: translation.id
                      })
                    }
                    sx={{ minWidth: 24 }}
                  >
                    <span
                      aria-label={`${tier.name}译文`}
                      className="word-sentence-translation-tier"
                    >
                      <strong>{tier.short}</strong>
                    </span>
                  </Button>
                  <TextField
                    multiline
                    minRows={1}
                    maxRows={4}
                    placeholder="请输入对应的中文译文"
                    disabled={disabled}
                    value={translation.content.text}
                    className="word-sentence-translation-input"
                    sx={{ flex: 1, minWidth: 0 }}
                    slotProps={{
                      htmlInput: {
                        "aria-label":
                          rows.length === 1
                            ? `例句 ${index + 1} 中文`
                            : `例句 ${index + 1} 译文 ${translationIndex + 1} 中文`,
                        "data-v3-field": "zh_translations",
                        "data-v3-node-id": translation.id
                      }
                    }}
                    onChange={(event) =>
                      onChange(
                        rows.map((item) =>
                          item.id === translation.id
                            ? {
                                ...item,
                                content: replaceRichText(
                                  item.content,
                                  event.target.value
                                )
                              }
                            : item
                        )
                      )
                    }
                  />
                  <IconButton
                    size="small"
                    className="word-sentence-translation-delete"
                    aria-label={`删除例句 ${index + 1} 译文 ${translationIndex + 1}`}
                    disabled={disabled || rows.length === 1}
                    onClick={() =>
                      onChange(
                        rows.filter((item) => item.id !== translation.id)
                      )
                    }
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </div>
          );
        })}
      </div>
      <Button
        fullWidth
        variant="outlined"
        className="word-sentence-translation-add word-section-add-button"
        disabled={disabled}
        startIcon={<Add />}
        aria-label={`添加例句 ${index + 1} 译文`}
        onClick={(event) =>
          setMenu({ anchor: event.currentTarget, kind: "add" })
        }
      >
        添加译文
      </Button>
      <Menu
        open={!!menu && !disabled}
        anchorEl={menu?.anchor}
        onClose={() => setMenu(undefined)}
      >
        {menu?.kind === "language" ? (
          <MenuItem
            selected
            onClick={() => {
              if (!disabled)
                onChange(rows.map((item) => ({ ...item, language: "zh" })));
              setMenu(undefined);
            }}
          >
            汉语
          </MenuItem>
        ) : (
          TIERS.map((tier) => (
            <MenuItem
              key={tier.key}
              selected={
                menu?.kind === "tier" &&
                rows.find((item) => item.id === menu.id)?.band === tier.key
              }
              onClick={() => chooseTier(tier.key)}
            >
              <span className="word-sentence-translation-tier-option">
                {tier.label}
                <span className="word-sentence-translation-tier-hint">
                  ({tier.hint})
                </span>
              </span>
            </MenuItem>
          ))
        )}
      </Menu>
    </div>
  );
}
