import { IconButton as MuiIconButton } from "@mui/material";
import {
  Alert as MuiAlert,
  Button as MuiButton,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";

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
  RichTextV2,
  VoiceProfileV3
} from "@tsz/types";
import type { VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import {
  editSynthesisUpsWords,
  pronunciationSynthesisContent,
  synthesisInputIssue,
  synthesisPhonemeWordRanges
} from "@tsz/shared";
import { env } from "@/lib/env";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../../voice-editor/dataSource";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { VoiceEditorModal } from "./VoiceEditorModal";
import "@tsz/voice-editor/reader.css";

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
  onChange: (candidate: PronunciationSynthesisCandidateV3) => void;
}) {
  const { edit: canEdit } = useContentEditPermissions();
  const [open, setOpen] = useState(false);
  const wordHistory = useRef(
    new Map<string, PronunciationSynthesisCandidateV3["ups_words"]>()
  );
  const capture = () => {
    wordHistory.current.clear();
    wordHistory.current.set(candidate.ups, candidate.ups_words);
    const speech = candidate[`${alphabet}_speech`];
    const ranges = synthesisPhonemeWordRanges(spelling, candidate, alphabet);
    return structuredClone({
      content: {
        version: 2 as const,
        text: candidate[alphabet],
        annotations: (speech?.content.text === spelling
          ? speech.content.annotations
          : []
        ).flatMap((mark) => {
          const range = ranges
            ?.slice(0, -1)
            .find(
              (range) => mark.type === "pause" && range.textEnd === mark.at
            );
          return range && mark.type === "pause"
            ? [{ ...mark, at: range.end }]
            : [];
        })
      },
      voice_profile: speech?.voice_profile ??
        fallbackVoiceProfile ?? { voices: [] },
      ups_words: candidate.ups_words
    });
  };
  const [draft, setDraft] = useState<{
    content: RichTextV2;
    voice_profile: VoiceProfileV3;
    ups_words: PronunciationSynthesisCandidateV3["ups_words"];
  }>(capture);
  const [source, setSource] = useState("");
  const editedCandidate = {
    ...candidate,
    [alphabet]: draft.content.text,
    ...(alphabet === "ups" ? { ups_words: draft.ups_words } : {})
  };
  const ranges = synthesisPhonemeWordRanges(
    spelling,
    editedCandidate,
    alphabet
  );
  const pauseIssue = draft.content.annotations.some(
    (mark) =>
      mark.type !== "pause" ||
      !ranges?.slice(0, -1).some((range) => range.end === mark.at)
  )
    ? "停顿只能设置在词间音标边界；短语 UPS 请保留逐词边界或从 IPA 重新转换"
    : undefined;
  const inputIssue =
    synthesisInputIssue(alphabet, draft.content.text) ?? pauseIssue;
  const resolveCandidate = (content: RichTextV2) => ({
    ...editedCandidate,
    [`${alphabet}_speech`]: {
      content: {
        ...content,
        text: spelling,
        annotations: content.annotations.flatMap((mark) => {
          const range = ranges
            ?.slice(0, -1)
            .find((range) => mark.type === "pause" && range.end === mark.at);
          return range && mark.type === "pause"
            ? [{ ...mark, at: range.textEnd }]
            : [];
        })
      },
      voice_profile: draft.voice_profile
    }
  });
  const sourceKey = JSON.stringify([
    spelling,
    candidate[alphabet],
    alphabet === "ups" ? candidate.ups_words : undefined
  ]);
  const latest = useRef({
    spelling,
    alphabet,
    locale,
    inputIssue,
    resolveCandidate
  });
  useLayoutEffect(() => {
    latest.current = {
      spelling,
      alphabet,
      locale,
      inputIssue,
      resolveCandidate
    };
  });
  const adapter = useMemo<VoicePreviewAdapter>(
    () => ({
      listVoices: (input) => adminVoicePreviewAdapter.listVoices(input),
      async synthesize(input, options) {
        const { spelling, alphabet, locale, inputIssue, resolveCandidate } =
          latest.current;
        if (inputIssue) throw new Error(inputIssue);
        const content = pronunciationSynthesisContent(spelling, {
          alphabet,
          ...resolveCandidate(input.content),
          use_spelling: false,
          ipa_locale: locale,
          ups_locale: locale
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
      <MuiIconButton
        aria-label={`打开${label} TTS 设置器`}
        data-v3-node-id={nodeId}
        data-v3-field={field}
        disabled={!canEdit}
        onClick={() => {
          setDraft(capture());
          setSource(sourceKey);
          setOpen(true);
        }}
      >
        <EditOutlined fontSize="inherit" />
      </MuiIconButton>
      {open && (
        <VoiceEditorModal
          title={`${label} · 音标、停顿与音色`}
          open
          footer={null}
          onClose={() => setOpen(false)}
        >
          <Suspense
            fallback={
              <MuiTypography component="span">正在加载 TTS 设置…</MuiTypography>
            }
          >
            <VoiceEditor
              readOnly={!canEdit || source !== sourceKey}
              mode="phoneme-settings"
              locale={locale}
              language="en"
              contextLabel={`${label}音标编辑`}
              value={draft.content}
              onChange={(content) =>
                setDraft((current) => {
                  const ups_words =
                    alphabet !== "ups"
                      ? current.ups_words
                      : wordHistory.current.has(content.text)
                        ? wordHistory.current.get(content.text)
                        : editSynthesisUpsWords(
                            spelling,
                            {
                              ...candidate,
                              ups: current.content.text,
                              ups_words: current.ups_words
                            },
                            content.text
                          );
                  if (alphabet === "ups")
                    wordHistory.current.set(content.text, ups_words);
                  return {
                    ...current,
                    content: toRichTextV2(content),
                    ups_words
                  };
                })
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
                <MuiStack direction="row" spacing={1} alignItems="center">
                  <MuiButton
                    aria-label={`取消${label}设置`}
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </MuiButton>
                  <MuiButton
                    aria-label={`完成${label}设置`}
                    disabled={
                      !canEdit ||
                      !canComplete ||
                      Boolean(inputIssue) ||
                      source !== sourceKey
                    }
                    onClick={() => {
                      onChange(resolveCandidate(draft.content));
                      setOpen(false);
                    }}
                    variant="contained"
                  >
                    完成
                  </MuiButton>
                </MuiStack>
              )}
            />
            {inputIssue && (
              <MuiAlert severity={"warning"}>{inputIssue}</MuiAlert>
            )}
          </Suspense>
        </VoiceEditorModal>
      )}
    </>
  );
}
