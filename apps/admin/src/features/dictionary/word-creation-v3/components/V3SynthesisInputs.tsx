import {
  SettingOutlined,
  SwapOutlined,
  CloseOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Input,
  Modal,
  Popover,
  Radio,
  Space,
  Typography
} from "antd";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import type {
  Dialect,
  PronunciationSynthesisCandidateV3,
  PronunciationSynthesisV3,
  V3DraftValidationIssue,
  WordPronunciationV3
} from "@tsz/types";
import {
  convertActualPronunciation,
  EMPTY_SYNTHESIS,
  pronunciationSynthesisContent,
  synthesisInputIssue,
  pronunciationLocale,
  pronunciationLocaleLabel,
  synthesisLocaleIssue,
  synthesisForLocale
} from "@tsz/shared";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { env } from "@/lib/env";
import "./V3SynthesisInputs.css";
const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);
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
  const localeLabel = pronunciationLocaleLabel(locale);
  const requireLocaleConfirmation = dialect === "common";
  const [expanded, setExpanded] = useState(false);
  const captureSettings = () =>
    structuredClone({
      voice_profile: pronunciation.voice_profile,
      audio_assets: pronunciation.audio_assets
    });
  const [settingsDraft, setSettingsDraft] = useState(captureSettings);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const closeSettings = () => {
    setExpanded(false);
    settingsTrigger.current?.focus();
  };
  const [diagnostic, setDiagnostic] = useState("");
  const [pending, setPending] = useState<{
    side: Side;
    alphabet: Alphabet;
    value: string;
    words: PronunciationSynthesisV3["ups_words"];
    previous: string;
    actual: string;
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
  const settingsVoiceLocales = useRef(new Map<string, "en-GB" | "en-US">());
  const settingsPreviewAdapter = useMemo<VoicePreviewAdapter>(
    () => ({
      async listVoices(input) {
        const voices = await adminVoicePreviewAdapter.listVoices(input);
        settingsVoiceLocales.current.clear();
        for (const voice of voices) {
          if (voice.locale === "en-GB" || voice.locale === "en-US")
            settingsVoiceLocales.current.set(voice.id, voice.locale);
        }
        return voices;
      },
      async synthesize(input, options) {
        const targetLocale = settingsVoiceLocales.current.get(input.voiceId);
        if (!targetLocale) throw new Error("请选择英式或美式音色");
        const selected = synthesisForLocale(synthesis, targetLocale, dialect);
        const targetContent = pronunciationSynthesisContent(
          spelling,
          selected,
          targetLocale,
          requireLocaleConfirmation
        );
        if (!targetContent)
          throw new Error(
            `${pronunciationLocaleLabel(targetLocale)}：${
              synthesisInputIssue(
                selected.alphabet,
                selected[selected.alphabet]
              ) ??
              synthesisLocaleIssue(
                selected,
                selected.alphabet,
                targetLocale,
                requireLocaleConfirmation
              ) ??
              "请检查合成输入与逐词边界"
            }`
          );
        return adminVoicePreviewAdapter.synthesize(
          { ...input, content: targetContent },
          options
        );
      }
    }),
    [dialect, requireLocaleConfirmation, spelling, synthesis]
  );
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
    words?: PronunciationSynthesisV3["ups_words"]
  ) => {
    const key = `${side}.${alphabet}` as const;
    const candidate = candidateForSide(synthesis, side, dialect);
    history.current[key] = [...history.current[key].slice(-99), candidate];
    writeCandidate(side, {
      ...candidate,
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
    const result = convertActualPronunciation(
      pronunciation.actual_pron,
      spelling,
      alphabet,
      pronunciationLocale(side, "uk")
    );
    if (!result.ok) {
      setDiagnostic(result.message);
      return;
    }
    const previous = candidateForSide(synthesis, side, dialect)[alphabet];
    if (previous && previous !== result.value)
      setPending({
        side,
        alphabet,
        value: result.value,
        words: result.ups_words,
        previous,
        actual: pronunciation.actual_pron,
        spelling
      });
    else change(side, alphabet, result.value, result.ups_words);
  };
  const settingsButton = (
    <Popover
      trigger="click"
      placement="topRight"
      open={expanded}
      onOpenChange={(open) => {
        if (open) setSettingsDraft(captureSettings());
        setExpanded(open);
      }}
      destroyOnHidden
      content={
        <div
          className="word-synthesis-settings"
          id={`speech-settings-${pronunciation.id}`}
          role="dialog"
          aria-label={`${label}发音设置`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.stopPropagation();
              closeSettings();
            }
          }}
        >
          <div className="word-synthesis-settings-header">
            <div>
              <Typography.Text strong>发音设置</Typography.Text>
              <Typography.Text
                type="secondary"
                className="word-synthesis-settings-source"
              >
                英式、美式音色 · 当前来源：
                {source === "spelling"
                  ? "词形拼写"
                  : `Azure ${source.toUpperCase()}`}
              </Typography.Text>
            </div>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label="收起设置"
              title="关闭发音设置"
              onClick={closeSettings}
            />
          </div>
          <div className="word-synthesis-settings-body">
            {!content && (
              <Typography.Text
                type="secondary"
                className="word-synthesis-settings-hint"
              >
                {localeLabel}：{selectedIssue ?? "请先填写有效正文和合成输入"}
                。音色可先配置。
              </Typography.Text>
            )}
            <Suspense
              fallback={<Typography.Text>正在加载发音设置…</Typography.Text>}
            >
              <VoiceEditor
                mode="synthesis"
                contextLabel={`${label}发音设置`}
                language="en"
                value={
                  content ?? { version: 2, text: spelling, annotations: [] }
                }
                onChange={() => {}}
                voiceProfile={settingsDraft.voice_profile}
                onVoiceProfileChange={(voice_profile) =>
                  setSettingsDraft((current) => ({ ...current, voice_profile }))
                }
                audioAssets={settingsDraft.audio_assets}
                onAudioAssetsChange={(audio_assets) =>
                  setSettingsDraft((current) => ({ ...current, audio_assets }))
                }
                renderActions={(canComplete) => (
                  <Space>
                    <Button
                      size="small"
                      aria-label={`取消${label}设置`}
                      onClick={closeSettings}
                    >
                      取消
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      aria-label={`完成${label}设置`}
                      disabled={!canComplete}
                      onClick={() => {
                        onChange(settingsDraft);
                        closeSettings();
                      }}
                    >
                      完成
                    </Button>
                  </Space>
                )}
                previewAdapter={
                  env.VOICE_PREVIEW ? settingsPreviewAdapter : undefined
                }
                previewIsMock={voicePreviewIsMock}
                audioUploadAdapter={
                  env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
                }
              />
            </Suspense>
          </div>
        </div>
      }
    >
      <Button
        ref={settingsTrigger}
        type="text"
        size="small"
        icon={<SettingOutlined />}
        aria-label={`${label}发音设置与真人录音`}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-controls={
          expanded ? `speech-settings-${pronunciation.id}` : undefined
        }
      >
        发音设置
      </Button>
    </Popover>
  );
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
                      (issue) => issue.field === `synthesis.${side}.${alphabet}`
                    );
                    return (
                      <div className="word-synthesis-candidate" key={side}>
                        <Space.Compact className="word-synthesis-control">
                          <Button
                            className={`word-synthesis-accent word-synthesis-accent-${side}${dialect === "common" ? "" : " word-synthesis-accent-compact"}`}
                            icon={<SwapOutlined />}
                            aria-label={`${label}转换为${sideLabel} ${name}`}
                            title={
                              alphabet === "ups" && side === "uk"
                                ? "英式 UPS 自动转换尚未支持，请手工填写已确认的音素或使用 IPA"
                                : `从实际发音转换为${sideLabel} ${name}`
                            }
                            onClick={() => convert(side, alphabet)}
                          >
                            {dialect === "common"
                              ? side === "uk"
                                ? "BrE"
                                : "AmE"
                              : null}
                          </Button>
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
                                ? "短语 UPS 词界缺失或与正文不一致，请重新从实际发音转换"
                                : undefined)
                            }
                            content={
                              rowContent ?? {
                                version: 2,
                                text: "",
                                annotations: []
                              }
                            }
                            voiceProfile={pronunciation.voice_profile}
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
            <Typography.Text className="word-pronunciation-label">
              语音来源
            </Typography.Text>
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
                <Radio value="spelling">词形拼写</Radio>
                <Radio value="ipa">Azure IPA</Radio>
                <Radio value="ups">Azure UPS</Radio>
              </Radio.Group>
              {settingsButton}
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
          {settingsButton}
        </Space>
      )}
      <Modal
        open={Boolean(pending)}
        title={`替换 Azure ${pending?.alphabet.toUpperCase() ?? ""}`}
        okText="应用转换结果"
        cancelText="取消"
        onCancel={() => setPending(undefined)}
        onOk={() => {
          if (!pending) return;
          if (
            candidateForSide(synthesis, pending.side, dialect)[
              pending.alphabet
            ] !== pending.previous ||
            pronunciation.actual_pron !== pending.actual ||
            spelling !== pending.spelling
          )
            setDiagnostic("来源、口音或目标内容已变化，请重新转换");
          else
            change(
              pending.side,
              pending.alphabet,
              pending.value,
              pending.words
            );
          setPending(undefined);
        }}
      >
        <Typography.Paragraph>
          将用以下结果替换已有内容，应用后可撤销：
        </Typography.Paragraph>
        <Typography.Paragraph code>{pending?.value}</Typography.Paragraph>
      </Modal>
    </div>
  );
}
