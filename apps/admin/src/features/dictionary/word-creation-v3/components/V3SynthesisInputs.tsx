import { AudioOutlined, SwapOutlined, UndoOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Input,
  Modal,
  Radio,
  Space,
  Tooltip,
  Typography
} from "antd";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  Dialect,
  V3DraftValidationIssue,
  WordPronunciationV3
} from "@tsz/types";
import {
  convertDictionaryPhonetic,
  EMPTY_SYNTHESIS,
  pronunciationSynthesisContent,
  synthesisInputIssue
} from "@tsz/shared";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { env } from "@/lib/env";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

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
  const [expanded, setExpanded] = useState(false);
  const [diagnostic, setDiagnostic] = useState("");
  const [pending, setPending] = useState<{
    alphabet: "ipa" | "ups";
    value: string;
    previous: string;
  }>();
  const history = useRef<{ ipa: string[]; ups: string[] }>({
    ipa: [],
    ups: []
  });
  const expected = useRef({ ipa: synthesis.ipa, ups: synthesis.ups });
  useEffect(() => {
    for (const alphabet of ["ipa", "ups"] as const) {
      if (expected.current[alphabet] !== synthesis[alphabet])
        history.current[alphabet] = [];
      expected.current[alphabet] = synthesis[alphabet];
    }
  }, [synthesis]);
  const label = `第 ${index + 1} 条发音`;
  const content = pronunciationSynthesisContent(spelling, synthesis);
  const selectedIssue = synthesisInputIssue(
    synthesis.alphabet,
    synthesis[synthesis.alphabet]
  );
  const change = (alphabet: "ipa" | "ups", value: string) => {
    history.current[alphabet] = [
      ...history.current[alphabet].slice(-99),
      synthesis[alphabet]
    ];
    expected.current[alphabet] = value;
    onChange({ synthesis: { ...synthesis, [alphabet]: value } });
    setDiagnostic("");
  };
  const undo = (alphabet: "ipa" | "ups") => {
    const value = history.current[alphabet].pop();
    if (value !== undefined) {
      expected.current[alphabet] = value;
      onChange({ synthesis: { ...synthesis, [alphabet]: value } });
    }
  };
  const convert = (alphabet: "ipa" | "ups") => {
    const result = convertDictionaryPhonetic(
      pronunciation.dict_phonetic,
      alphabet
    );
    if (!result.ok) {
      setDiagnostic(
        `字典音标第 ${result.position + 1} 个字符${result.symbol ? `「${result.symbol}」` : ""}：${result.message}`
      );
      return;
    }
    setDiagnostic("");
    if (synthesis[alphabet] && synthesis[alphabet] !== result.value) {
      setPending({
        alphabet,
        value: result.value,
        previous: synthesis[alphabet]
      });
    } else if (synthesis[alphabet] !== result.value)
      change(alphabet, result.value);
  };
  return (
    <div className="word-pronunciation-synthesis">
      {synthesisEditable ? (
        <>
          <Space wrap>
            <Typography.Text>合成来源</Typography.Text>
            <Radio.Group
              aria-label={`${label}的合成来源`}
              value={synthesis.alphabet}
              options={[
                { label: "Azure IPA", value: "ipa" },
                { label: "Azure UPS", value: "ups" }
              ]}
              onChange={(event) =>
                onChange({
                  synthesis: { ...synthesis, alphabet: event.target.value }
                })
              }
            />
            <PronunciationPreviewControls
              playbackOnly
              pronunciationId={pronunciation.id}
              dialect={dialect}
              ariaLabelPrefix={`${label} 最终读音`}
              disabled={!content}
              disabledReason={
                selectedIssue ??
                (!spelling.trim() ? "请先填写词形拼写" : undefined)
              }
              content={content ?? { version: 2, text: "", annotations: [] }}
              voiceProfile={pronunciation.voice_profile}
            />
          </Space>
          {(["ipa", "ups"] as const).map((alphabet) => {
            const name = `Azure ${alphabet.toUpperCase()}`;
            const invalid = issues.some(
              (issue) => issue.field === `synthesis.${alphabet}`
            );
            return (
              <div className="word-pronunciation-row" key={alphabet}>
                <Typography.Text className="word-pronunciation-label">
                  {name}
                </Typography.Text>
                <Space.Compact block>
                  <Tooltip
                    title={`从字典音标转换为 ${name}${alphabet === "ups" ? "，不读取或覆盖人工 IPA" : ""}`}
                  >
                    <Button
                      icon={<SwapOutlined />}
                      aria-label={`${label}转换为 ${name}`}
                      onClick={() => convert(alphabet)}
                    />
                  </Tooltip>
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    aria-label={`${label}的${name}`}
                    data-v3-node-id={pronunciation.id}
                    data-v3-field={`synthesis.${alphabet}`}
                    status={invalid ? "error" : undefined}
                    aria-invalid={invalid}
                    value={synthesis[alphabet]}
                    placeholder={`输入 ${name} 音素`}
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
                  <Button
                    icon={<UndoOutlined />}
                    aria-label={`${label}撤销 ${name}`}
                    disabled={!history.current[alphabet].length}
                    onClick={() => undo(alphabet)}
                  />
                  <Tooltip
                    title={
                      synthesis.alphabet === alphabet
                        ? "发音设置与真人录音"
                        : `请先选择 ${name} 作为合成来源`
                    }
                  >
                    <Button
                      icon={<AudioOutlined />}
                      aria-label={`${label}打开 ${name} 发音设置`}
                      disabled={synthesis.alphabet !== alphabet}
                      onClick={() => setExpanded((value) => !value)}
                    />
                  </Tooltip>
                </Space.Compact>
                {invalid && (
                  <Typography.Text type="danger">
                    {synthesisInputIssue(alphabet, synthesis[alphabet]) ??
                      "请检查合成输入"}
                  </Typography.Text>
                )}
              </div>
            );
          })}
          {diagnostic && <Alert type="warning" title={diagnostic} showIcon />}
        </>
      ) : (
        <Space wrap>
          {pronunciation.synthesis && (
            <Typography.Text>
              Azure {synthesis.alphabet.toUpperCase()}（当前来源） · IPA：
              {synthesis.ipa || "未填写"} · UPS：{synthesis.ups || "未填写"}
            </Typography.Text>
          )}
          <Button
            icon={<AudioOutlined />}
            aria-label={`${label}发音设置与真人录音`}
            onClick={() => setExpanded((value) => !value)}
          >
            发音设置与真人录音
          </Button>
        </Space>
      )}
      {expanded && (
        <>
          <Typography.Text>
            当前使用 Azure {synthesis.alphabet.toUpperCase()}
          </Typography.Text>
          {!content && (
            <Alert type="info" title={selectedIssue ?? "请先填写词形拼写"} />
          )}
          <Suspense
            fallback={<Typography.Text>正在加载发音设置…</Typography.Text>}
          >
            <VoiceEditor
              mode="synthesis"
              contextLabel={`${label}发音设置`}
              language="en"
              locale={
                dialect === "uk"
                  ? "en-GB"
                  : dialect === "us"
                    ? "en-US"
                    : undefined
              }
              value={content ?? { version: 2, text: "", annotations: [] }}
              onChange={() => {}}
              voiceProfile={pronunciation.voice_profile}
              onVoiceProfileChange={(voice_profile) =>
                onChange({ voice_profile })
              }
              audioAssets={pronunciation.audio_assets}
              onAudioAssetsChange={(audio_assets) => onChange({ audio_assets })}
              previewAdapter={
                env.VOICE_PREVIEW ? adminVoicePreviewAdapter : undefined
              }
              previewIsMock={voicePreviewIsMock}
              audioUploadAdapter={
                env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
              }
            />
          </Suspense>
          <Button onClick={() => setExpanded(false)}>收起设置</Button>
        </>
      )}
      <Modal
        open={Boolean(pending)}
        title={`替换 Azure ${pending?.alphabet.toUpperCase() ?? ""}`}
        okText="应用转换结果"
        cancelText="取消"
        onCancel={() => setPending(undefined)}
        onOk={() => {
          if (!pending) return;
          if (synthesis[pending.alphabet] !== pending.previous) {
            setDiagnostic("目标内容已变化，请重新转换");
            setPending(undefined);
            return;
          }
          change(pending.alphabet, pending.value);
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
