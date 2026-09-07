import type {
  AudioAssetV3,
  RichTextV2,
  RichTextV3,
  VoiceProfileV3
} from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { editRichText, remapTextLinks } from "@tsz/voice-editor/core";
import { EditOutlined } from "@ant-design/icons";
import { Button, Input, Space } from "antd";
import { Suspense, lazy, useState } from "react";
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
  const fallback = (
    <Input.TextArea
      aria-label={ariaLabel}
      autoSize={{ minRows: 1, maxRows: 6 }}
      className="word-pronunciation-phonetic-input"
      data-v3-field={field}
      data-v3-node-id={nodeId}
      onChange={(event) =>
        onChange(
          editRichText(value, event.target.value),
          mode === "association"
            ? remapTextLinks(value.text, event.target.value, textLinks ?? [])
            : undefined
        )
      }
      placeholder={placeholder}
      readOnly={readOnly || (env.VOICE_EDITOR && editing)}
      value={value.text}
    />
  );

  if (!env.VOICE_EDITOR) return fallback;

  if (!editing) {
    return (
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
    );
  }

  return (
    <div className="v3-voice-text-editor">
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
          onChange={(next: RichTextV2, nextLinks) => onChange(next, nextLinks)}
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
