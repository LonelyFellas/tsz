import { PlayCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Flex, Select, Space, Typography } from "antd";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import type { AdminSpeechVoice } from "@tsz/types";
import type {
  VoicePreviewAdapter,
  VoiceSetting,
  SsmlDraft
} from "@tsz/voice-editor/types";
import { ReferenceAudio, SsmlReview } from "@tsz/voice-editor/editor";
import { VoiceTrialEditor } from "./VoiceTrialEditor";
import { voiceTrialIssue, type VoiceTrialSource } from "./voice-trial";
import {
  VoicePreviewResult,
  type VoicePreviewData
} from "./VoicePreviewResult";
import "@tsz/voice-editor/styles.css";
import "./voice-audition-panel.css";

export function VoiceAuditionPanel({
  voice,
  source,
  canReadWords,
  readOnly,
  onSourceChange,
  onValidationChange,
  canAudition,
  canGenerate,
  pending,
  onAudition,
  onCancelPreview,
  preview,
  error,
  player,
  adapter,
  setting,
  registerStop,
  sourceAction,
  comparisonAction,
  ssmlDraft,
  onSsmlDraftChange
}: {
  voice: AdminSpeechVoice;
  source: VoiceTrialSource;
  canReadWords: boolean;
  readOnly: boolean;
  onSourceChange: (source: VoiceTrialSource) => void;
  onValidationChange: (ready: boolean) => void;
  canAudition: boolean;
  canGenerate: boolean;
  pending: boolean;
  onAudition: () => void;
  onCancelPreview: () => void;
  preview?: VoicePreviewData | null;
  error?: string | null;
  player: RefObject<HTMLAudioElement | null>;
  adapter: VoicePreviewAdapter;
  setting: VoiceSetting;
  registerStop: (stop: () => void) => () => void;
  sourceAction?: ReactNode;
  comparisonAction?: ReactNode;
  ssmlDraft?: SsmlDraft;
  onSsmlDraftChange?: (draft: SsmlDraft) => void;
}) {
  const [ssmlExpanded, setSsmlExpanded] = useState(false);
  const ssml = useRef<() => void>(undefined);
  const reference = useRef<() => void>(undefined);
  const stop = useCallback(() => {
    ssml.current?.();
    reference.current?.();
  }, []);
  useEffect(() => {
    const unregister = registerStop(stop);
    return () => {
      stop();
      unregister();
    };
  }, [registerStop, stop]);
  const registerSsml = useCallback((value: () => void) => {
    ssml.current = value;
    return () => {
      if (ssml.current === value) ssml.current = undefined;
    };
  }, []);
  const registerReference = useCallback((value: () => void) => {
    reference.current = value;
    return () => {
      if (reference.current === value) reference.current = undefined;
    };
  }, []);
  const issue = voiceTrialIssue(voice, source);
  return (
    <section className="voice-audition-panel" aria-label="试听与审听">
      <div className="voice-audition-toolbar">
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Typography.Text strong>试听内容</Typography.Text>
          <Space wrap>
            <Select
              aria-label="试听输出格式"
              value={source.output_format}
              options={[
                { value: "mp3", label: "MP3" },
                { value: "wav", label: "WAV" }
              ]}
              disabled={readOnly}
              onChange={(output_format) =>
                onSourceChange({ ...source, output_format })
              }
            />
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              aria-label="试听当前参数"
              loading={pending}
              disabled={readOnly || !canAudition || !!issue}
              onClick={onAudition}
            >
              试听当前参数
            </Button>
            {comparisonAction}
          </Space>
        </Flex>
        {sourceAction}
      </div>
      <VoiceTrialEditor
        key={voice.alias}
        voice={voice}
        source={source}
        canReadWords={canReadWords}
        readOnly={readOnly}
        onValidationChange={onValidationChange}
        onChange={onSourceChange}
      />
      {issue && <Alert type="warning" showIcon title={issue} />}
      <div className="voice-audition-preview">
        <Typography.Text strong>音频审听</Typography.Text>
        <VoicePreviewResult
          preview={preview}
          pending={pending}
          error={error}
          onCancel={onCancelPreview}
          player={player}
          onPlay={stop}
        />
        <ReferenceAudio
          registerStop={registerReference}
          onPlay={() => {
            player.current?.pause();
            ssml.current?.();
          }}
        />
      </div>
      <Collapse
        ghost
        className="voice-library-tools"
        styles={{ body: { padding: "0 0 8px" } }}
        activeKey={ssmlExpanded ? ["tools"] : []}
        onChange={(keys) => {
          setSsmlExpanded(keys.includes("tools"));
          if (!keys.includes("tools")) ssml.current?.();
        }}
        items={[
          {
            key: "tools",
            label: "SSML",
            forceRender: true,
            children: canGenerate && (
              <SsmlReview
                singleVoice
                draft={ssmlDraft}
                onDraftChange={onSsmlDraftChange}
                expanded={ssmlExpanded}
                adapter={adapter}
                content={source.content}
                settings={[setting]}
                onPlay={() => {
                  player.current?.pause();
                  reference.current?.();
                }}
                registerStop={registerSsml}
              />
            )
          }
        ]}
      />
    </section>
  );
}
