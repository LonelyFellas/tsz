import type { RichTextV2, RichTextV3, VoiceProfileV3 } from "@tsz/types";
import { Input } from "antd";
import { Suspense, lazy } from "react";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "@/features/dictionary/voice-editor/dataSource";
import { env } from "@/lib/env";
// 样式随组件一起引入：V3 这条路径此前从没挂过语音编辑器，不引的话两层各画各的、完全错位。
import "@tsz/voice-editor/styles.css";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);

export interface V3VoiceTextFieldProps {
  value: RichTextV3;
  ariaLabel: string;
  nodeId: string;
  field: string;
  placeholder?: string;
  readOnly?: boolean;
  /** 发音配置；与正文分开走，因为它在 wire 上是正文的兄弟字段。 */
  voiceProfile?: VoiceProfileV3 | null;
  onVoiceProfileChange?: (next: VoiceProfileV3) => void;
  onChange: (next: RichTextV3) => void;
}

/**
 * V3 里带语音标注的文本字段。
 *
 * 编辑器就地内联、改动实时回写；旗标关掉或代码块还没加载完时退化成普通文本框，
 * 保证这块地方任何时候都能录入文字。
 *
 * `data-v3-node-id` / `data-v3-field` 必须落在**真正可聚焦的输入框**上：向导的
 * 错误定位是 `querySelector` 之后 `focus()` 再校验 `activeElement`，挂在外层
 * 容器上会让「跳到出错字段」失效。
 */
export function V3VoiceTextField({
  value,
  ariaLabel,
  nodeId,
  field,
  placeholder,
  readOnly,
  voiceProfile,
  onVoiceProfileChange,
  onChange
}: V3VoiceTextFieldProps) {
  const fallback = (
    <Input.TextArea
      aria-label={ariaLabel}
      autoSize={{ minRows: 2, maxRows: 6 }}
      className="word-pronunciation-phonetic-input"
      data-v3-field={field}
      data-v3-node-id={nodeId}
      onChange={(event) =>
        onChange({ version: 2, text: event.target.value, annotations: [] })
      }
      placeholder={placeholder}
      readOnly={readOnly}
      value={value.text}
    />
  );

  if (!env.VOICE_EDITOR) return fallback;

  return (
    <Suspense fallback={fallback}>
      <VoiceEditor
        contextLabel={ariaLabel}
        inputDataAttributes={{
          "data-v3-node-id": nodeId,
          "data-v3-field": field
        }}
        language="en"
        placeholder={placeholder}
        onChange={(next: RichTextV2) => onChange(next)}
        previewAdapter={
          env.VOICE_PREVIEW ? adminVoicePreviewAdapter : undefined
        }
        previewIsMock={voicePreviewIsMock}
        onVoiceProfileChange={onVoiceProfileChange}
        readOnly={readOnly}
        value={value}
        voiceProfile={voiceProfile}
      />
    </Suspense>
  );
}
