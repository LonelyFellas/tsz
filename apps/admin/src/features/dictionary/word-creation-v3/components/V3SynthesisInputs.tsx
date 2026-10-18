import { V3PhonemeSpeechSettings } from "./V3PhonemeSpeechSettings";
import { SwapOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Modal, Radio, Space, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import type {
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
  pronunciationLocaleLabel,
  synthesisLocaleIssue,
  synthesisForLocale
} from "@tsz/shared";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import "./V3SynthesisInputs.css";
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
  onChange
}: {
  pronunciation: WordPronunciationV3;
  synthesisEditable: boolean;
  spelling: string;
  dialect: Dialect;
  index: number;
  issues: readonly V3DraftValidationIssue[];
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const synthesis = pronunciation.synthesis ?? EMPTY_SYNTHESIS;
  const { preference } = useDialectPreference();
  const locale = pronunciationLocale(dialect, preference);
  const requireLocaleConfirmation = dialect === "common";
  const [diagnostic, setDiagnostic] = useState("");
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
  const label = `第 ${index + 1} 条发音`;
  const selectedSynthesis = synthesisForLocale(synthesis, locale, dialect);
  const content = pronunciationSynthesisContent(
    spelling,
    selectedSynthesis,
    locale,
    requireLocaleConfirmation
  );
  const selectedIssue = synthesis.use_spelling
    ? undefined
    : (synthesisInputIssue(
        synthesis.alphabet,
        selectedSynthesis[synthesis.alphabet]
      ) ??
      synthesisLocaleIssue(
        selectedSynthesis,
        synthesis.alphabet,
        locale,
        requireLocaleConfirmation
      ));
  const source = synthesis.use_spelling ? "spelling" : synthesis.alphabet;
  const writeCandidate = (
    side: Side,
    candidate: PronunciationSynthesisCandidateV3
  ) => {
    const next = { ...synthesis, [side]: candidate };
    expected.current = next;
    onChange({ synthesis: next });
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

  return (
    <div className="word-pronunciation-synthesis" data-phoneme-locale={locale}>
      {synthesisEditable ? (
        <>
          {(["ipa", "ups"] as const).map((alphabet) => {
            const name = `Azure ${alphabet.toUpperCase()}`;
            return (
              <div className="word-pronunciation-row" key={alphabet}>
                <Typography.Text className="word-pronunciation-label">
                  {name}
                </Typography.Text>
                <div className="word-synthesis-candidates">
                  {(dialect === "common" ? SIDES : [dialect]).map((side) => {
                    const sideLocale = pronunciationLocale(side, "uk");
                    const sideLabel = pronunciationLocaleLabel(sideLocale);
                    const candidate = candidateForSide(
                      synthesis,
                      side,
                      dialect
                    );
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
                    const invalid = issues.some(
                      (issue) =>
                        issue.field === `synthesis.${side}.${alphabet}` ||
                        issue.field === `synthesis.${side}.${alphabet}_speech`
                    );
                    return (
                      <div className="word-synthesis-candidate" key={side}>
                        <Space.Compact className="word-synthesis-control">
                          <PronunciationPreviewControls
                            playbackOnly
                            pronunciationId={pronunciation.id}
                            dialect={side}
                            ariaLabelPrefix={`${label} ${sideLabel} ${name} 最终读音`}
                            disabled={!rowContent}
                            disabledReason={
                              synthesisInputIssue(
                                alphabet,
                                candidate[alphabet]
                              ) ??
                              (!rowContent
                                ? "音素词界缺失或与正文不一致，请检查 IPA 或重新转换 UPS"
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
                          <Input.TextArea
                            className="tsz-phonetics"
                            autoSize={{ minRows: 1, maxRows: 6 }}
                            aria-label={`${label}的${sideLabel} ${name}`}
                            data-v3-node-id={pronunciation.id}
                            data-v3-field={`synthesis.${side}.${alphabet}`}
                            status={invalid ? "error" : undefined}
                            aria-invalid={invalid}
                            value={candidate[alphabet]}
                            placeholder={`请输入${sideLabel}${alphabet.toUpperCase()}`}
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
                          <Button
                            icon={<SwapOutlined />}
                            aria-label={`${label}转换为${sideLabel} ${name}`}
                            title={
                              alphabet === "ipa"
                                ? `从字典音标转换为${sideLabel} ${name}`
                                : `从当前${sideLabel} Azure IPA 转换为 ${name}`
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
                            onChange={(next) => writeCandidate(side, next)}
                          />
                        </Space.Compact>
                        {invalid && (
                          <Typography.Text
                            className="word-field-help"
                            type="danger"
                          >
                            {synthesisInputIssue(
                              alphabet,
                              candidate[alphabet]
                            ) ?? "请检查合成输入与逐词边界"}
                          </Typography.Text>
                        )}
                      </div>
                    );
                  })}
                </div>
                {dialect === "common" &&
                  synthesis[alphabet].trim() &&
                  !synthesis[
                    alphabet === "ipa" ? "ipa_locale" : "ups_locale"
                  ] && (
                    <div className="word-synthesis-locale-warning">
                      <Typography.Text type="warning">
                        旧 {name}：{synthesis[alphabet]}
                        ，请确认口音后保留到对应一侧。
                      </Typography.Text>
                      {SIDES.map((side) => (
                        <Button
                          key={side}
                          type="link"
                          size="small"
                          aria-label={`${label}确认 ${name} 为${side === "uk" ? "英式" : "美式"}`}
                          disabled={Boolean(
                            synthesis[side]?.[alphabet]?.trim()
                          )}
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
                          确认此音标为{side === "uk" ? "英式" : "美式"}
                        </Button>
                      ))}
                    </div>
                  )}
              </div>
            );
          })}
          <div className="word-pronunciation-row">
            <div className="word-synthesis-source-label">
              <Typography.Text className="word-pronunciation-label">
                语音来源
              </Typography.Text>
            </div>
            <div className="word-synthesis-source-actions">
              <Radio.Group
                name={`synthesis-source-${pronunciation.id}`}
                aria-label={`${label}的合成来源`}
                value={source}
                onChange={(event) =>
                  onChange({
                    synthesis: {
                      ...synthesis,
                      use_spelling: event.target.value === "spelling",
                      ...(event.target.value !== "spelling"
                        ? { alphabet: event.target.value }
                        : {})
                    }
                  })
                }
              >
                {[
                  {
                    value: "spelling",
                    name: "词形拼写",
                    text: spelling,
                    fontClass: "tsz-words"
                  },
                  {
                    value: "ipa",
                    name: "Azure IPA",
                    text: selectedSynthesis.ipa.trim()
                      ? `/ ${selectedSynthesis.ipa.trim()} /`
                      : "",
                    fontClass: "tsz-phonetics"
                  },
                  {
                    value: "ups",
                    name: "Azure UPS",
                    text: selectedSynthesis.ups,
                    fontClass: "tsz-phonetics"
                  }
                ].map((option) => (
                  <Radio
                    key={option.value}
                    value={option.value}
                    aria-label={option.name}
                    className="word-synthesis-choice"
                  >
                    <span className="word-synthesis-choice-content">
                      <span className="word-synthesis-choice-tag">
                        {option.name}
                      </span>
                      <span
                        className={`word-synthesis-choice-preview ${option.fontClass}`}
                        title={option.text}
                      >
                        {option.text}
                      </span>
                    </span>
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          </div>
          {diagnostic && <Alert type="warning" title={diagnostic} showIcon />}
          {!synthesis.use_spelling && !content && (
            <Typography.Text type="warning">
              {selectedIssue ?? "当前合成输入缺少有效词界，请重新转换"}
            </Typography.Text>
          )}
        </>
      ) : (
        <Space wrap>
          <Typography.Text>
            当前来源：
            {source === "spelling"
              ? "词形拼写"
              : `Azure ${source.toUpperCase()}`}
          </Typography.Text>
        </Space>
      )}
      <Modal
        open={Boolean(pending)}
        title={
          pending?.normalizedIpa !== undefined
            ? "规范 Azure IPA 并转换 UPS"
            : `替换 Azure ${pending?.alphabet.toUpperCase() ?? ""}`
        }
        okText="应用转换结果"
        cancelText="取消"
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
            setDiagnostic("来源、口音或目标内容已变化，请重新转换");
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
              当前 Azure IPA 含字典记法 r。确认后将其改为英语音素 ɹ，再转换为
              UPS；其他音素保持原样。
            </Typography.Paragraph>
            <Typography.Paragraph className="tsz-phonetics">
              IPA：{pending.source} → {pending.normalizedIpa}
            </Typography.Paragraph>
          </>
        )}
        <Typography.Paragraph>
          将用以下结果替换已有内容，应用后可撤销：
        </Typography.Paragraph>
        <Typography.Paragraph code>{pending?.value}</Typography.Paragraph>
      </Modal>
    </div>
  );
}
