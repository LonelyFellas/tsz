import { ThunderboltFilled } from "@ant-design/icons";
import { Button, Flex } from "antd";

// —— 底部 sticky 操作栏：贴内容区底部（不遮挡侧栏），随内容滚动固定在视口底部。————————
export function EditorFooter({
  onSaveDraft,
  onGenerateVoice,
  onSubmit
}: {
  onSaveDraft: () => void;
  onGenerateVoice: () => void;
  onSubmit: () => void;
}) {
  return (
    <Flex
      gap={12}
      justify="flex-end"
      align="center"
      style={{
        position: "sticky",
        bottom: 0,
        marginTop: 16,
        padding: "12px 16px",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid #eee",
        borderRadius: 8
      }}
    >
      <Button onClick={onSaveDraft}>保存草稿</Button>
      <Button icon={<ThunderboltFilled />} onClick={onGenerateVoice}>
        生成语音
      </Button>
      <Button type="primary" icon={<ThunderboltFilled />} onClick={onSubmit}>
        提交
      </Button>
    </Flex>
  );
}
