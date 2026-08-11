import { Button, Flex, Space, Typography } from "antd";
import type { VoiceRichTextFieldProps } from "../types";
import { RichTextReadOnly } from "./RichTextReadOnly";

export function VoiceRichTextField({
  value,
  contextLabel,
  dialectLabel,
  readOnly,
  onEdit
}: VoiceRichTextFieldProps) {
  return (
    <div className="tsz-ve-field" data-testid="voice-rich-text-field">
      <Flex justify="space-between" align="center" gap={8}>
        <Space size={6}>
          {contextLabel && (
            <Typography.Text strong>{contextLabel}</Typography.Text>
          )}
          {dialectLabel && (
            <Typography.Text type="secondary">{dialectLabel}</Typography.Text>
          )}
        </Space>
        {!readOnly && onEdit && (
          <Button type="text" size="small" onClick={onEdit}>
            语音编辑
          </Button>
        )}
      </Flex>
      <div className="tsz-ve-field-content">
        <RichTextReadOnly value={value} />
      </div>
    </div>
  );
}
