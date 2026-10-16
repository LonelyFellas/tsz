import { EditOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import {
  lazy,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  PhonemeLocaleV3,
  PronunciationSynthesisCandidateV3,
  SynthesisSpeechV3,
  VoiceProfileV3
} from "@tsz/types";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { pronunciationSynthesisContent } from "@tsz/shared";
import { env } from "@/lib/env";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { VoiceEditorModal } from "./VoiceEditorModal";
import "@tsz/voice-editor/styles.css";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

export function V3PhonemeSpeechSettings({
  spelling,
  candidate,
  alphabet,
  locale,
  label,
  fallbackVoiceProfile,
  nodeId,
  field,
  onChange
}: {
  spelling: string;
  candidate: PronunciationSynthesisCandidateV3;
  alphabet: "ipa" | "ups";
  locale: PhonemeLocaleV3;
  label: string;
  fallbackVoiceProfile?: VoiceProfileV3;
  nodeId: string;
  field: string;
  onChange: (speech: SynthesisSpeechV3) => void;
}) {
  const { edit: canEdit } = useContentEditPermissions();
  const [open, setOpen] = useState(false);
  const capture = (): SynthesisSpeechV3 =>
    structuredClone(
      candidate[`${alphabet}_speech`] ?? {
        content: { version: 2, text: spelling, annotations: [] },
        voice_profile: fallbackVoiceProfile ?? { voices: [] }
      }
    );
  const [draft, setDraft] = useState(capture);
  const [source, setSource] = useState("");
  const sourceKey = JSON.stringify([
    spelling,
    candidate[alphabet],
    alphabet === "ups" ? candidate.ups_words : undefined
  ]);
  const latest = useRef({ spelling, candidate, alphabet, locale, draft });
  useLayoutEffect(() => {
    latest.current = { spelling, candidate, alphabet, locale, draft };
  });
  const adapter = useMemo<VoicePreviewAdapter>(
    () => ({
      listVoices: (input) => adminVoicePreviewAdapter.listVoices(input),
      async synthesize(input, options) {
        const { spelling, candidate, alphabet, locale, draft } = latest.current;
        const content = pronunciationSynthesisContent(spelling, {
          alphabet,
          ...candidate,
          use_spelling: false,
          ipa_locale: locale,
          ups_locale: locale,
          [`${alphabet}_speech`]: { ...draft, content: input.content }
        });
        if (!content)
          throw new Error(
            "音素与词形词界不一致，请检查对应音素；短语 UPS 可重新从 IPA 转换"
          );
        return adminVoicePreviewAdapter.synthesize(
          { ...input, content },
          options
        );
      }
    }),
    []
  );
  return (
    <>
      <Button
        icon={<EditOutlined />}
        aria-label={`打开${label} TTS 设置器`}
        data-v3-node-id={nodeId}
        data-v3-field={field}
        disabled={!canEdit}
        onClick={() => {
          setDraft(capture());
          setSource(sourceKey);
          setOpen(true);
        }}
      />
      {open && (
        <VoiceEditorModal
          title={`${label} · 停顿与音色`}
          open
          footer={null}
          onCancel={() => setOpen(false)}
        >
          <Suspense
            fallback={<Typography.Text>正在加载 TTS 设置…</Typography.Text>}
          >
            <VoiceEditor
              readOnly={!canEdit || source !== sourceKey}
              mode="phoneme-settings"
              locale={locale}
              language="en"
              textReadOnly
              contextLabel={`${label}停顿设置`}
              value={draft.content}
              onChange={(content) =>
                setDraft((current) => ({ ...current, content }))
              }
              voiceProfile={draft.voice_profile}
              onVoiceProfileChange={(voice_profile) =>
                setDraft((current) => ({ ...current, voice_profile }))
              }
              previewAdapter={
                env.VOICE_PREVIEW && source === sourceKey ? adapter : undefined
              }
              previewIsMock={voicePreviewIsMock}
              renderActions={(canComplete) => (
                <Space>
                  <Button
                    aria-label={`取消${label}设置`}
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="primary"
                    aria-label={`完成${label}设置`}
                    disabled={!canEdit || !canComplete || source !== sourceKey}
                    onClick={() => {
                      onChange(draft);
                      setOpen(false);
                    }}
                  >
                    完成
                  </Button>
                </Space>
              )}
            />
          </Suspense>
        </VoiceEditorModal>
      )}
    </>
  );
}
