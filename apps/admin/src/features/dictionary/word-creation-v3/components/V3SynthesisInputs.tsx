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
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  Dialect,
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
  synthesisLocaleIssue
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
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const closeSettings = () => {
    setExpanded(false);
    settingsTrigger.current?.focus();
  };
  const [diagnostic, setDiagnostic] = useState("");
  const [pending, setPending] = useState<{
    alphabet: Alphabet;
    value: string;
    words: PronunciationSynthesisV3["ups_words"];
    previous: string;
    actual: string;
    spelling: string;
    locale: string;
  }>();
  const history = useRef<{
    ipa: PronunciationSynthesisV3[];
    ups: PronunciationSynthesisV3[];
  }>({ ipa: [], ups: [] });
  const expected = useRef(synthesis);
  useEffect(() => {
    for (const alphabet of ["ipa", "ups"] as const)
      if (expected.current[alphabet] !== synthesis[alphabet])
        history.current[alphabet] = [];
    expected.current = synthesis;
  }, [synthesis]);
  const label = `第 ${index + 1} 条发音`;
  const content = pronunciationSynthesisContent(
    spelling,
    synthesis,
    locale,
    requireLocaleConfirmation
  );
  const selectedIssue = synthesis.use_spelling
    ? undefined
    : (synthesisInputIssue(synthesis.alphabet, synthesis[synthesis.alphabet]) ??
      synthesisLocaleIssue(
        synthesis,
        synthesis.alphabet,
        locale,
        requireLocaleConfirmation
      ));
  const source = synthesis.use_spelling ? "spelling" : synthesis.alphabet;
  const change = (
    alphabet: Alphabet,
    value: string,
    words?: PronunciationSynthesisV3["ups_words"]
  ) => {
    history.current[alphabet] = [
      ...history.current[alphabet].slice(-99),
      synthesis
    ];
    const next = {
      ...synthesis,
      use_spelling:
        alphabet === "ups"
          ? (synthesis.use_spelling ?? false)
          : synthesis.use_spelling,
      [alphabet]: value,
      [alphabet === "ipa" ? "ipa_locale" : "ups_locale"]: locale,
      ...(alphabet === "ups" ? { ups_words: words ?? null } : {})
    };
    expected.current = next;
    onChange({ synthesis: next });
    setDiagnostic("");
  };
  const undo = (alphabet: Alphabet) => {
    const previous = history.current[alphabet].pop();
    if (previous) {
      const next = {
        ...synthesis,
        [alphabet]: previous[alphabet],
        [alphabet === "ipa" ? "ipa_locale" : "ups_locale"]:
          previous[alphabet === "ipa" ? "ipa_locale" : "ups_locale"],
        ...(alphabet === "ups"
          ? {
              ups_words: previous.ups_words,
              use_spelling:
                synthesis.use_spelling === false &&
                previous.use_spelling == null
                  ? previous.use_spelling
                  : synthesis.use_spelling
            }
          : {})
      };
      expected.current = next;
      onChange({ synthesis: next });
      setDiagnostic("");
    }
  };
  const convert = (alphabet: Alphabet) => {
    const result = convertActualPronunciation(
      pronunciation.actual_pron,
      spelling,
      alphabet,
      locale
    );
    if (!result.ok) {
      setDiagnostic(result.message);
      return;
    }
    const previous = synthesis[alphabet] ?? "";
    if (previous && previous !== result.value)
      setPending({
        alphabet,
        value: result.value,
        words: result.ups_words,
        previous,
        actual: pronunciation.actual_pron,
        spelling,
        locale
      });
    else change(alphabet, result.value, result.ups_words);
  };
  const settingsButton = (
    <Popover
      trigger="click"
      placement="topRight"
      open={expanded}
      onOpenChange={setExpanded}
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
                当前口音：{localeLabel} · {locale}；当前来源：
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
                {selectedIssue ?? "请先填写有效正文和合成输入"}。音色可先配置。
              </Typography.Text>
            )}
            <Suspense
              fallback={<Typography.Text>正在加载发音设置…</Typography.Text>}
            >
              <VoiceEditor
                mode="synthesis"
                contextLabel={`${label}发音设置`}
                language="en"
                locale={locale}
                value={content ?? { version: 2, text: "", annotations: [] }}
                onChange={() => {}}
                voiceProfile={pronunciation.voice_profile}
                onVoiceProfileChange={(voice_profile) =>
                  onChange({ voice_profile })
                }
                audioAssets={pronunciation.audio_assets}
                onAudioAssetsChange={(audio_assets) =>
                  onChange({ audio_assets })
                }
                previewAdapter={
                  env.VOICE_PREVIEW ? adminVoicePreviewAdapter : undefined
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
      <Typography.Text
        type="secondary"
        className="word-synthesis-locale-notice"
      >
        当前发音：{localeLabel}（{locale}）
        {dialect === "common"
          ? " · 通用栏按个人偏好，切换后需重新确认候选"
          : ""}
      </Typography.Text>
      {synthesisEditable ? (
        <>
          {(["ipa", "ups"] as const).map((alphabet) => {
            const name = `Azure ${alphabet.toUpperCase()}`;
            const rowContent = pronunciationSynthesisContent(
              spelling,
              {
                ...synthesis,
                alphabet,
                use_spelling: synthesis.use_spelling == null ? undefined : false
              },
              locale,
              requireLocaleConfirmation
            );
            const localeIssue = synthesisLocaleIssue(
              synthesis,
              alphabet,
              locale,
              requireLocaleConfirmation
            );
            const candidateLocale =
              synthesis[alphabet === "ipa" ? "ipa_locale" : "ups_locale"];
            const invalid = issues.some(
              (issue) => issue.field === `synthesis.${alphabet}`
            );
            return (
              <div className="word-pronunciation-row" key={alphabet}>
                <Typography.Text className="word-pronunciation-label">
                  {name}
                  <span className="word-synthesis-locale-label">
                    {localeLabel}
                  </span>
                </Typography.Text>
                <div className="word-synthesis-input">
                  <Space.Compact className="word-synthesis-control">
                    <Button
                      type="text"
                      icon={<SwapOutlined />}
                      aria-label={`${label}转换为 ${name}`}
                      title={
                        alphabet === "ups" && locale !== "en-US"
                          ? "英式 UPS 自动转换尚未支持，请手工填写已确认的音素或使用 IPA"
                          : `从${localeLabel}实际发音转换为 ${name}`
                      }
                      onClick={() => convert(alphabet)}
                    />
                    <Input.TextArea
                      autoSize={{ minRows: 1, maxRows: 6 }}
                      aria-label={`${label}的${name}`}
                      data-v3-node-id={pronunciation.id}
                      data-v3-field={`synthesis.${alphabet}`}
                      status={invalid ? "error" : undefined}
                      aria-invalid={invalid}
                      value={synthesis[alphabet] ?? ""}
                      placeholder={`输入 ${alphabet.toUpperCase()} ${alphabet === "ups" ? "音素编码" : "音素"}`}
                      onChange={(event) => change(alphabet, event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key.toLowerCase() === "z" &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();
                          undo(alphabet);
                        }
                      }}
                    />
                    <PronunciationPreviewControls
                      playbackOnly
                      pronunciationId={pronunciation.id}
                      dialect={dialect}
                      ariaLabelPrefix={`${label} ${name} 最终读音`}
                      disabled={!rowContent}
                      disabledReason={
                        synthesisInputIssue(alphabet, synthesis[alphabet]) ??
                        localeIssue ??
                        (!rowContent
                          ? "短语 UPS 词界缺失或与正文不一致，请重新从实际发音转换"
                          : undefined)
                      }
                      content={
                        rowContent ?? { version: 2, text: "", annotations: [] }
                      }
                      voiceProfile={pronunciation.voice_profile}
                    />
                  </Space.Compact>
                </div>
                {localeIssue && (
                  <div className="word-synthesis-locale-warning">
                    <Typography.Text type="warning">
                      {localeIssue}
                    </Typography.Text>
                    {!candidateLocale && synthesis[alphabet].trim() && (
                      <Button
                        type="link"
                        size="small"
                        aria-label={`${label}确认 ${name} 为${localeLabel}`}
                        onClick={() =>
                          onChange({
                            synthesis: {
                              ...synthesis,
                              [alphabet === "ipa"
                                ? "ipa_locale"
                                : "ups_locale"]: locale
                            }
                          })
                        }
                      >
                        确认此音标为{localeLabel}
                      </Button>
                    )}
                  </div>
                )}
                {alphabet === "ups" && locale !== "en-US" && (
                  <Typography.Text
                    type="secondary"
                    className="word-synthesis-locale-warning"
                  >
                    英式 UPS 自动转换暂未支持；可手工输入并确认对应口音后试听。
                  </Typography.Text>
                )}
                {invalid && (
                  <Typography.Text className="word-field-help" type="danger">
                    {synthesisInputIssue(alphabet, synthesis[alphabet]) ??
                      "请检查合成输入与逐词边界"}
                  </Typography.Text>
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
            (synthesis[pending.alphabet] ?? "") !== pending.previous ||
            pronunciation.actual_pron !== pending.actual ||
            spelling !== pending.spelling ||
            locale !== pending.locale
          )
            setDiagnostic("来源、口音或目标内容已变化，请重新转换");
          else change(pending.alphabet, pending.value, pending.words);
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
