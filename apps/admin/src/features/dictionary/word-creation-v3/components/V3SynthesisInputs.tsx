import { localPhoneticDiagnostic } from "./localPhoneticDiagnostic";
import { useLexiconEditorTranslation } from "../../i18n/editor";
import {
  useLexiconEditorMessageState as useCreationMessageState,
  createLexiconEditorMessage as creationMessage
} from "../../i18n/editor";
import { V3PhonemeSpeechSettings } from "./V3PhonemeSpeechSettings";
import { ChevronDownIcon, ArrowLeftRightIcon } from "lucide-react";
import { Alert, Button, Space, Typography } from "@tsz/ui/admin/display";
import { Input, Radio } from "@tsz/ui/admin/forms";
import { Modal } from "@tsz/ui/admin/overlays";
import { useEffect, useId, useRef, useState } from "react";
import type {
  AudioAssetV3,
  Dialect,
  PronunciationSynthesisCandidateV3,
  PronunciationSynthesisV3,
  V3DraftValidationIssue,
  WordPronunciationV3
} from "@tsz/types";
import {
  convertDictionaryToAzureIpa,
  convertAzureIpaToUps,
  EMPTY_SYNTHESIS,
  pronunciationSynthesisContent,
  synthesisInputIssue,
  pronunciationLocale,
  synthesisLocaleIssue,
  synthesisForLocale
} from "@tsz/shared";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { v3IssueMessage } from "../presentationErrors";
import "./V3SynthesisInputs.css";
import { RequiredFieldFeedback } from "../../RequiredFieldFeedback";
type Alphabet = "ipa" | "ups";
type Side = "uk" | "us";
const SIDES = ["uk", "us"] as const;
function candidateForSide(
  synthesis: PronunciationSynthesisV3,
  side: Side,
  dialect: Dialect
): PronunciationSynthesisCandidateV3 {
  if (synthesis[side]) return synthesis[side];
  const locale = pronunciationLocale(side, "uk");
  const ipaMatches = synthesis.ipa_locale
    ? synthesis.ipa_locale === locale
    : dialect === side;
  const upsMatches = synthesis.ups_locale
    ? synthesis.ups_locale === locale
    : dialect === side;
  return {
    ipa: ipaMatches ? synthesis.ipa : "",
    ups: upsMatches ? synthesis.ups : "",
    ...(upsMatches ? { ups_words: synthesis.ups_words } : {})
  };
}
export function V3SynthesisInputs({
  pronunciation,
  synthesisEditable,
  spelling,
  dialect,
  index,
  issues,
  onMissingDictionary,
  onMissingSpelling,
  onChange
}: {
  pronunciation: WordPronunciationV3;
  synthesisEditable: boolean;
  spelling: string;
  dialect: Dialect;
  index: number;
  issues: readonly V3DraftValidationIssue[];
  onMissingDictionary?: () => void;
  onMissingSpelling?: () => void;
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const synthesis = pronunciation.synthesis ?? EMPTY_SYNTHESIS;
  const inputPrefix = useId();
  const [missingIpa, setMissingIpa] = useState<Side>();
  const [upsState, setUpsState] = useState<
    "unmounted" | "collapsed" | "expanded"
  >("unmounted");
  const upsExpanded = upsState === "expanded";
  const upsIssueKey = issues
    .filter((issue) =>
      /^synthesis\.(?:(?:uk|us)\.)?ups(?:_speech)?(?:\.|$)/.test(issue.field)
    )
    .map((issue) => JSON.stringify([issue.field, issue.code, issue.message]))
    .sort()
    .join("\n");
  useEffect(() => {
    if (upsIssueKey) setUpsState("expanded");
  }, [upsIssueKey]);
  const { preference } = useDialectPreference();
  const locale = pronunciationLocale(dialect, preference);
  const requireLocaleConfirmation = dialect === "common";
  const [diagnostic, setDiagnostic] = useCreationMessageState();
  const [pending, setPending] = useState<{
    side: Side;
    alphabet: Alphabet;
    value: string;
    words: PronunciationSynthesisV3["ups_words"];
    previous: string;
    source: string;
    normalizedIpa?: string;
    style: WordPronunciationV3["style"];
    spelling: string;
  }>();
  const history = useRef<
    Record<`${Side}.${Alphabet}`, PronunciationSynthesisCandidateV3[]>
  >({
    "uk.ipa": [],
    "uk.ups": [],
    "us.ipa": [],
    "us.ups": []
  });
  const expected = useRef(synthesis);
  useEffect(() => {
    for (const side of SIDES) {
      for (const alphabet of ["ipa", "ups"] as const) {
        if (
          candidateForSide(expected.current, side, dialect)[alphabet] !==
          candidateForSide(synthesis, side, dialect)[alphabet]
        )
          history.current[`${side}.${alphabet}`] = [];
      }
    }
    expected.current = synthesis;
  }, [synthesis, dialect]);
  const label = t("creation_pronunciation_item", { index: index + 1 });
  const selectedSynthesis = synthesisForLocale(synthesis, locale, dialect);
  const content = pronunciationSynthesisContent(
    spelling,
    selectedSynthesis,
    locale,
    requireLocaleConfirmation
  );
  const selectedIssue =
    selectedSynthesis.source === "none" ||
    selectedSynthesis.source === "upload" ||
    selectedSynthesis.use_spelling
      ? undefined
      : (synthesisInputIssue(
          selectedSynthesis.alphabet,
          selectedSynthesis[selectedSynthesis.alphabet]
        ) ??
        synthesisLocaleIssue(
          selectedSynthesis,
          selectedSynthesis.alphabet,
          locale,
          requireLocaleConfirmation
        ));
  const source =
    selectedSynthesis.source ??
    (selectedSynthesis.use_spelling ? "spelling" : selectedSynthesis.alphabet);
  const writeCandidate = (
    side: Side,
    candidate: PronunciationSynthesisCandidateV3,
    audioAssets?: AudioAssetV3[]
  ) => {
    const previous = candidateForSide(synthesis, side, dialect);
    const updated = { ...candidate };
    for (const alphabet of ["ipa", "ups"] as const) {
      if (
        previous[alphabet] !== candidate[alphabet] ||
        (alphabet === "ups" &&
          JSON.stringify(previous.ups_words) !==
            JSON.stringify(candidate.ups_words))
      ) {
        const speech = candidate[`${alphabet}_speech`];
        const previousAssets = new Set(
          previous[`${alphabet}_speech`]?.voice_profile.voices.map(
            (setting) => setting.audio_asset_id
          )
        );
        if (speech)
          updated[`${alphabet}_speech`] = {
            ...speech,
            voice_profile: {
              ...speech.voice_profile,
              voices: speech.voice_profile.voices.map((setting) => {
                if (!previousAssets.has(setting.audio_asset_id)) return setting;
                const { audio_asset_id: _audio, ...rest } = setting;
                return rest;
              })
            }
          };
      }
    }
    const next = { ...synthesis, [side]: updated };
    expected.current = next;
    onChange({
      synthesis: next,
      ...(audioAssets ? { audio_assets: audioAssets } : {})
    });
    setDiagnostic("");
  };
  const change = (
    side: Side,
    alphabet: Alphabet,
    value: string,
    words?: PronunciationSynthesisV3["ups_words"],
    normalizedIpa?: string
  ) => {
    const key = `${side}.${alphabet}` as const;
    const candidate = candidateForSide(synthesis, side, dialect);
    history.current[key] = [...history.current[key].slice(-99), candidate];
    if (normalizedIpa !== undefined)
      history.current[`${side}.ipa`] = [
        ...history.current[`${side}.ipa`].slice(-99),
        candidate
      ];
    writeCandidate(side, {
      ...candidate,
      ...(normalizedIpa !== undefined ? { ipa: normalizedIpa } : {}),
      [alphabet]: value,
      ...(alphabet === "ups" ? { ups_words: words ?? null } : {})
    });
  };
  const undo = (side: Side, alphabet: Alphabet) => {
    const previous = history.current[`${side}.${alphabet}`].pop();
    if (previous)
      writeCandidate(side, {
        ...candidateForSide(synthesis, side, dialect),
        [alphabet]: previous[alphabet],
        ...(alphabet === "ups" ? { ups_words: previous.ups_words } : {})
      });
  };
  const convert = (side: Side, alphabet: Alphabet) => {
    const source =
      alphabet === "ipa"
        ? pronunciation.dict_phonetic
        : candidateForSide(synthesis, side, dialect).ipa;
    if (!source.trim()) {
      setDiagnostic("");
      if (alphabet === "ipa") onMissingDictionary?.();
      else {
        setMissingIpa(side);
        document.getElementById(`${inputPrefix}-${side}-ipa`)?.focus();
      }
      return;
    }
    if (!spelling.trim()) {
      setDiagnostic("");
      onMissingSpelling?.();
      return;
    }
    let result =
      alphabet === "ipa"
        ? convertDictionaryToAzureIpa(
            source,
            spelling,
            pronunciationLocale(side, "uk"),
            pronunciation.style
          )
        : convertAzureIpaToUps(
            source,
            spelling,
            pronunciationLocale(side, "uk")
          );
    let normalizedIpa: string | undefined;
    // Dictionary shorthand needs explicit confirmation before entering strict IPA conversion.
    if (alphabet === "ups" && !result.ok && source.includes("r")) {
      const normalized = source.replaceAll("r", "ɹ");
      const converted = convertAzureIpaToUps(
        normalized,
        spelling,
        pronunciationLocale(side, "uk")
      );
      if (converted.ok) {
        normalizedIpa = normalized;
        result = converted;
      }
    }
    if (!result.ok) {
      setDiagnostic(result.message);
      return;
    }
    const previous = candidateForSide(synthesis, side, dialect)[alphabet];
    setDiagnostic("");
    if (normalizedIpa !== undefined || (previous && previous !== result.value))
      setPending({
        side,
        alphabet,
        value: result.value,
        words: result.ups_words,
        previous,
        source,
        normalizedIpa,
        style: pronunciation.style,
        spelling
      });
    else change(side, alphabet, result.value, result.ups_words);
  };

  const renderInputs = (alphabet: Alphabet) => {
    const name = `Azure ${alphabet.toUpperCase()}`;
    const legacyLocale =
      dialect === "common"
        ? (synthesis[alphabet === "ipa" ? "ipa_locale" : "ups_locale"] ??
          locale)
        : locale;
    const legacySide = legacyLocale === "en-GB" ? "uk" : "us";
    return (
      <div className="word-pronunciation-row" key={alphabet}>
        <div className="word-synthesis-candidates">
          {(dialect === "common" ? SIDES : [dialect]).map((side) => {
            const sideLocale = pronunciationLocale(side, "uk");
            const sideLabel = t(side === "uk" ? "dialect_uk" : "dialect_us");
            const candidate = candidateForSide(synthesis, side, dialect);
            const rowContent = pronunciationSynthesisContent(
              spelling,
              {
                alphabet,
                use_spelling:
                  synthesis.use_spelling == null ? undefined : false,
                ...candidate,
                ipa_locale: sideLocale,
                ups_locale: sideLocale
              },
              sideLocale
            );
            const field = `synthesis.${side}.${alphabet}`;
            const requiredError =
              alphabet === "ipa" && missingIpa === side && !candidate.ipa.trim()
                ? t("creation_phonetic_enter_azure_alphabet", {
                    alphabet: "IPA"
                  })
                : undefined;
            const requiredErrorId = `${inputPrefix}-${side}-${alphabet}-required`;
            const inputIssue =
              issues.find((issue) => issue.field === field) ??
              (side === legacySide
                ? issues.find(
                    (issue) => issue.field === `synthesis.${alphabet}`
                  )
                : undefined);
            const invalid =
              Boolean(inputIssue) ||
              Boolean(requiredError) ||
              issues.some((issue) => issue.field === `${field}_speech`);
            return (
              <div className="word-synthesis-candidate" key={side}>
                <label
                  className="word-pronunciation-label"
                  htmlFor={`${inputPrefix}-${side}-${alphabet}`}
                >
                  {sideLabel} {name}
                </label>
                <Space.Compact className="word-synthesis-control">
                  <PronunciationPreviewControls
                    playbackOnly
                    pronunciationId={pronunciation.id}
                    dialect={side}
                    ariaLabelPrefix={t("creation_final_reading_label", {
                      label,
                      side: sideLabel,
                      name
                    })}
                    disabled={
                      !rowContent ||
                      candidate.source === "none" ||
                      candidate.source === "upload"
                    }
                    disabledReason={
                      localPhoneticDiagnostic(
                        synthesisInputIssue(alphabet, candidate[alphabet]),
                        t
                      ) ??
                      (!rowContent
                        ? t(
                            "creation_phoneme_word_boundaries_are_missing_or_do_not_match_the_text_check_ipa_or_convert_ups_agai"
                          )
                        : undefined)
                    }
                    content={
                      rowContent ?? {
                        version: 2,
                        text: "",
                        annotations: []
                      }
                    }
                    voiceProfile={
                      candidate[`${alphabet}_speech`]?.voice_profile ??
                      pronunciation.voice_profile
                    }
                  />
                  <RequiredFieldFeedback
                    message={requiredError}
                    messageId={requiredErrorId}
                  >
                    <Input.TextArea
                      id={`${inputPrefix}-${side}-${alphabet}`}
                      className="tsz-phonetics"
                      autoSize={{ minRows: 1, maxRows: 6 }}
                      aria-label={t("creation_synthesis_field", {
                        label,
                        side: sideLabel,
                        name
                      })}
                      data-v3-node-id={pronunciation.id}
                      data-v3-field={inputIssue?.field ?? field}
                      status={invalid ? "error" : undefined}
                      aria-invalid={invalid}
                      aria-describedby={
                        requiredError ? requiredErrorId : undefined
                      }
                      value={candidate[alphabet]}
                      placeholder={
                        requiredError
                          ? undefined
                          : t("creation_synthesis_placeholder", {
                              side: sideLabel,
                              alphabet: alphabet.toUpperCase()
                            })
                      }
                      onChange={(event) =>
                        change(side, alphabet, event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key.toLowerCase() === "z" &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();
                          undo(side, alphabet);
                        }
                      }}
                    />
                  </RequiredFieldFeedback>
                  <Button
                    icon={<ArrowLeftRightIcon />}
                    aria-label={t("creation_convert_field", {
                      label,
                      side: sideLabel,
                      name
                    })}
                    title={
                      alphabet === "ipa"
                        ? t("creation_convert_dictionary", {
                            side: sideLabel,
                            name
                          })
                        : t("creation_convert_current_ipa", {
                            side: sideLabel,
                            name
                          })
                    }
                    onClick={() => convert(side, alphabet)}
                  />
                  <V3PhonemeSpeechSettings
                    spelling={spelling}
                    nodeId={pronunciation.id}
                    field={`synthesis.${side}.${alphabet}_speech`}
                    candidate={candidate}
                    alphabet={alphabet}
                    locale={sideLocale}
                    label={`${label} ${sideLabel} ${name}`}
                    fallbackVoiceProfile={pronunciation.voice_profile}
                    audioAssets={pronunciation.audio_assets}
                    onChange={(next, audioAssets) =>
                      writeCandidate(side, next, audioAssets)
                    }
                  />
                </Space.Compact>
                {invalid && !requiredError && (
                  <Typography.Text className="word-field-help" type="danger">
                    {localPhoneticDiagnostic(
                      synthesisInputIssue(alphabet, candidate[alphabet]),
                      t
                    ) ??
                      (inputIssue
                        ? v3IssueMessage(inputIssue, t)
                        : t(
                            "creation_check_synthesis_input_and_word_boundaries"
                          ))}
                  </Typography.Text>
                )}
              </div>
            );
          })}
        </div>
        {dialect === "common" &&
          synthesis[alphabet].trim() &&
          !synthesis[alphabet === "ipa" ? "ipa_locale" : "ups_locale"] && (
            <div className="word-synthesis-locale-warning">
              <Typography.Text type="warning">
                {t("creation_legacy_phoneme_value", {
                  name,
                  value: synthesis[alphabet]
                })}
              </Typography.Text>
              {SIDES.map((side) => (
                <Button
                  key={side}
                  type="link"
                  size="small"
                  aria-label={t("creation_confirm_label_side", {
                    label,
                    name,
                    side: t(side === "uk" ? "candidate_uk" : "candidate_us")
                  })}
                  disabled={Boolean(synthesis[side]?.[alphabet]?.trim())}
                  onClick={() => {
                    const candidate = candidateForSide(
                      synthesis,
                      side,
                      dialect
                    );
                    const next = {
                      ...synthesis,
                      [alphabet]: "",
                      [side]: {
                        ...candidate,
                        [alphabet]: synthesis[alphabet],
                        ...(alphabet === "ups"
                          ? { ups_words: synthesis.ups_words }
                          : {})
                      }
                    };
                    expected.current = next;
                    onChange({ synthesis: next });
                  }}
                >
                  {t("creation_confirm_phoneme_locale", {
                    locale: t(side === "uk" ? "candidate_uk" : "candidate_us")
                  })}
                </Button>
              ))}
            </div>
          )}
      </div>
    );
  };

  return (
    <div className="word-pronunciation-synthesis" data-phoneme-locale={locale}>
      {synthesisEditable ? (
        <>
          {renderInputs("ipa")}
          <div className="word-synthesis-optional word-pronunciation-row">
            <div className="word-synthesis-source-label word-synthesis-source-heading">
              <Typography.Text className="word-pronunciation-label">
                {t("creation_speech_source")}
              </Typography.Text>
              <Button
                className="word-synthesis-ups-toggle"
                type="text"
                size="small"
                icon={
                  <ChevronDownIcon
                    style={{
                      transform: upsExpanded ? "rotate(180deg)" : undefined
                    }}
                  />
                }
                iconPlacement="end"
                aria-label={t("creation_ups_toggle", {
                  action: t(upsExpanded ? "panel_collapse" : "panel_expand"),
                  label
                })}
                aria-expanded={upsExpanded}
                title={
                  upsExpanded
                    ? t("creation_collapse_ups_input")
                    : t("creation_expand_ups_input")
                }
                onClick={() =>
                  setUpsState((state) =>
                    state === "expanded" ? "collapsed" : "expanded"
                  )
                }
              >
                UPS
              </Button>
            </div>
            {upsState !== "unmounted" && (
              <div
                className="word-synthesis-ups-fields"
                hidden={!upsExpanded}
                aria-hidden={!upsExpanded}
                inert={!upsExpanded}
              >
                {renderInputs("ups")}
              </div>
            )}
            <div className="word-synthesis-source-actions">
              {SIDES.filter(
                (side) => dialect === "common" || dialect === side
              ).map((side) => {
                const candidate = candidateForSide(synthesis, side, dialect);
                const current = synthesisForLocale(
                  synthesis,
                  side === "uk" ? "en-GB" : "en-US",
                  dialect
                );
                const sideLabel = t(
                  side === "uk" ? "dialect_uk" : "dialect_us"
                );
                return (
                  <section
                    key={side}
                    aria-label={t("creation_accent_source", {
                      side: sideLabel
                    })}
                  >
                    <Typography.Text>{sideLabel}</Typography.Text>
                    <Radio.Group
                      data-v3-node-id={pronunciation.id}
                      data-v3-field={`synthesis.${side}.source`}
                      aria-label={t("creation_accent_source", {
                        side: sideLabel
                      })}
                      value={
                        current.source ??
                        (current.use_spelling ? "spelling" : current.alphabet)
                      }
                      onChange={(event) =>
                        writeCandidate(side, {
                          ...candidate,
                          source: event.target.value
                        })
                      }
                    >
                      {[
                        { value: "spelling", label: t("spelling") },
                        { value: "ipa", label: "Azure IPA" },
                        { value: "ups", label: "Azure UPS" },
                        {
                          value: "upload",
                          label: t("creation_uploaded_source")
                        },
                        {
                          value: "none",
                          label: t("creation_accent_not_configured")
                        }
                      ].map((option) => (
                        <Radio
                          key={option.value}
                          value={option.value}
                          aria-label={option.label}
                        >
                          {option.label}
                        </Radio>
                      ))}
                    </Radio.Group>
                  </section>
                );
              })}
            </div>
          </div>
          {diagnostic && (
            <Alert
              type="warning"
              title={localPhoneticDiagnostic(diagnostic, t)}
              showIcon
            />
          )}
          {selectedSynthesis.source !== "none" &&
            selectedSynthesis.source !== "upload" &&
            !selectedSynthesis.use_spelling &&
            !content &&
            Boolean(selectedSynthesis[selectedSynthesis.alphabet].trim()) && (
              <Typography.Text type="warning">
                {localPhoneticDiagnostic(selectedIssue, t) ??
                  t(
                    "creation_the_current_synthesis_input_has_no_valid_word_boundaries_convert_it_again"
                  )}
              </Typography.Text>
            )}
        </>
      ) : (
        <Space wrap>
          <Typography.Text>
            {t("creation_current_source", {
              source:
                source === "none"
                  ? t("creation_accent_not_configured")
                  : source === "upload"
                    ? t("creation_uploaded_source")
                    : source === "spelling"
                      ? t("spelling")
                      : `Azure ${source.toUpperCase()}`
            })}
          </Typography.Text>
        </Space>
      )}
      <Modal
        open={Boolean(pending)}
        title={
          pending?.normalizedIpa !== undefined
            ? t("creation_normalise_azure_ipa_and_convert_to_ups")
            : t("creation_replace_azure", {
                alphabet: pending?.alphabet.toUpperCase() ?? ""
              })
        }
        okText={t("creation_apply_conversion")}
        cancelText={t("batch_cancel")}
        onCancel={() => setPending(undefined)}
        onOk={() => {
          if (!pending) return;
          if (
            candidateForSide(synthesis, pending.side, dialect)[
              pending.alphabet
            ] !== pending.previous ||
            (pending.alphabet === "ipa"
              ? pronunciation.dict_phonetic
              : candidateForSide(synthesis, pending.side, dialect).ipa) !==
              pending.source ||
            pronunciation.style !== pending.style ||
            spelling !== pending.spelling
          )
            setDiagnostic(
              creationMessage(
                "creation_the_source_accent_or_target_content_has_changed_convert_again"
              )
            );
          else
            change(
              pending.side,
              pending.alphabet,
              pending.value,
              pending.words,
              pending.normalizedIpa
            );
          setPending(undefined);
        }}
      >
        {pending?.normalizedIpa !== undefined && (
          <>
            <Typography.Paragraph>
              {t(
                "creation_the_current_azure_ipa_contains_dictionary_notation_r_confirm_to_change_it_to_the_english_p"
              )}
            </Typography.Paragraph>
            <Typography.Paragraph className="tsz-phonetics">
              IPA：{pending.source} → {pending.normalizedIpa}
            </Typography.Paragraph>
          </>
        )}
        <Typography.Paragraph>
          {t(
            "creation_the_following_result_will_replace_the_existing_content_you_can_undo_it_after_applying"
          )}
        </Typography.Paragraph>
        <Typography.Paragraph code>{pending?.value}</Typography.Paragraph>
      </Modal>
    </div>
  );
}
