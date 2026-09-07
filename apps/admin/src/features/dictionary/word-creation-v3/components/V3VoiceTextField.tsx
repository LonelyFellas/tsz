import type {
  AudioAssetV3,
  RichTextV2,
  RichTextV3,
  VoiceProfileV3
} from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import {
  editRichText,
  remapTextLinks,
  toRichTextV2
} from "@tsz/voice-editor/core";
import { EditOutlined } from "@ant-design/icons";
import { Button, Input, Space, message } from "antd";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  adminAudioUploadAdapter,
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { env } from "@/lib/env";
// 样式随组件一起引入：V3 这条路径此前从没挂过语音编辑器，不引的话两层各画各的、完全错位。
import "@tsz/voice-editor/styles.css";
import "./V3VoiceTextField.css";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

export interface V3VoiceTextFieldProps {
  mode?: VoiceEditorProps["mode"];
  textLinks?: VoiceEditorProps["textLinks"];
  renderAssociationPicker?: VoiceEditorProps["renderAssociationPicker"];
  value: RichTextV3;
  ariaLabel: string;
  nodeId: string;
  field: string;
  placeholder?: string;
  readOnly?: boolean;
  /** 发音配置；与正文分开走，因为它在 wire 上是正文的兄弟字段。 */
  voiceProfile?: VoiceProfileV3 | null;
  onVoiceProfileChange?: (next: VoiceProfileV3) => void;
  /** 挂在这段文本上的真人录音；与 voice_profile 一样是正文的兄弟字段。 */
  audioAssets?: AudioAssetV3[] | null;
  onAudioAssetsChange?: (next: AudioAssetV3[]) => void;
  onChange: VoiceEditorProps["onChange"];
}

/**
 * V3 里带语音标注的文本字段。
 *
 * 默认显示普通输入框，点击右侧入口才展开编辑器；完成后回到输入框。
 * 两种视图都实时回写同一份正文、标注和关联，不把富文本降成纯字符串。
 *
 * `data-v3-node-id` / `data-v3-field` 必须落在**真正可聚焦的输入框**上：向导的
 * 错误定位是 `querySelector` 之后 `focus()` 再校验 `activeElement`，挂在外层
 * 容器上会让「跳到出错字段」失效。
 */
export function V3VoiceTextField({
  mode,
  textLinks,
  renderAssociationPicker,
  value,
  ariaLabel,
  nodeId,
  field,
  placeholder,
  readOnly,
  voiceProfile,
  onVoiceProfileChange,
  audioAssets,
  onAudioAssetsChange,
  onChange
}: V3VoiceTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const [feedback, feedbackHolder] = message.useMessage();
  type Snapshot = { value: RichTextV3; links: typeof textLinks };
  const history = useRef<{
    past: Snapshot[];
    future: Snapshot[];
    expected: string;
  }>({
    past: [],
    future: [],
    expected: JSON.stringify([nodeId, value, textLinks])
  });
  useEffect(() => {
    const key = JSON.stringify([nodeId, value, textLinks]);
    if (key !== history.current.expected) {
      history.current = { past: [], future: [], expected: key };
    }
  }, [nodeId, value, textLinks]);
  const publish = (next: RichTextV3, links: typeof textLinks) => {
    history.current.expected = JSON.stringify([
      nodeId,
      toRichTextV2(next),
      links
    ]);
    onChange(toRichTextV2(next), links);
  };
  const change: VoiceEditorProps["onChange"] = (next, links) => {
    if (readOnly) return;
    history.current.past = [
      ...history.current.past.slice(-99),
      { value, links: textLinks }
    ];
    history.current.future = [];
    publish(next, links);
  };
  const restore = (redo: boolean) => {
    if (readOnly) return;
    const source = redo ? history.current.future : history.current.past;
    const snapshot = source.pop();
    if (!snapshot) return;
    const destination = redo ? history.current.past : history.current.future;
    destination.push({ value, links: textLinks });
    publish(snapshot.value, snapshot.links);
  };
  const fallback = (
    <Input.TextArea
      aria-label={ariaLabel}
      autoSize={{ minRows: 1, maxRows: 6 }}
      className="word-pronunciation-phonetic-input"
      data-v3-field={field}
      data-v3-node-id={nodeId}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
        ) {
          event.preventDefault();
          restore(event.shiftKey || event.key.toLowerCase() === "y");
        }
      }}
      onChange={(event) => {
        const inputType = (event.nativeEvent as InputEvent).inputType;
        if (inputType === "historyUndo" || inputType === "historyRedo") {
          restore(inputType === "historyRedo");
          return;
        }
        const next = editRichText(value, event.target.value);
        const links =
          mode === "association"
            ? remapTextLinks(value.text, event.target.value, textLinks ?? [])
            : undefined;
        const removed =
          (textLinks?.length ?? 0) > (links?.length ?? 0) ||
          toRichTextV2(value).annotations.length > next.annotations.length;
        change(next, links);
        if (removed)
          void feedback.info("已移除受改字影响的关联或标注，可撤销恢复");
      }}
      placeholder={placeholder}
      readOnly={readOnly || (env.VOICE_EDITOR && editing)}
      value={value.text}
    />
  );

  if (!env.VOICE_EDITOR)
    return (
      <>
        {feedbackHolder}
        {fallback}
      </>
    );

  if (!editing) {
    return (
      <>
        {feedbackHolder}
        <Space.Compact block>
          {fallback}
          <Button
            aria-label={`打开${ariaLabel}编辑器`}
            disabled={readOnly}
            icon={<EditOutlined />}
            onClick={() => setEditing(true)}
            style={{ height: "auto" }}
          >
            编辑器
          </Button>
        </Space.Compact>
      </>
    );
  }

  return (
    <div className="v3-voice-text-editor">
      {feedbackHolder}
      <Suspense fallback={<div style={{ paddingBottom: 32 }}>{fallback}</div>}>
        <VoiceEditor
          textReadOnly
          mode={mode}
          textLinks={textLinks}
          renderAssociationPicker={renderAssociationPicker}
          contextLabel={ariaLabel}
          inputDataAttributes={{
            "data-v3-node-id": nodeId,
            "data-v3-field": field
          }}
          language="en"
          placeholder={placeholder}
          onChange={(next: RichTextV2, nextLinks) => change(next, nextLinks)}
          previewAdapter={
            env.VOICE_PREVIEW ? adminVoicePreviewAdapter : undefined
          }
          previewIsMock={voicePreviewIsMock}
          onVoiceProfileChange={onVoiceProfileChange}
          // 开关关着 = 不注入适配器：面板置灰说明原因，已有的音频引用仍列出来。
          audioUploadAdapter={
            env.VOICE_AUDIO_UPLOAD && mode !== "association"
              ? adminAudioUploadAdapter
              : undefined
          }
          audioAssets={audioAssets ?? undefined}
          onAudioAssetsChange={onAudioAssetsChange}
          readOnly={readOnly}
          value={value}
          voiceProfile={voiceProfile}
        />
      </Suspense>
      <Button
        type="primary"
        size="small"
        className="v3-voice-text-editor-done"
        aria-label={`完成${ariaLabel}编辑`}
        onClick={() => setEditing(false)}
      >
        完成
      </Button>
    </div>
  );
}
