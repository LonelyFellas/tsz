import { App, Card, Radio, Space, Typography } from "antd";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "./useDialectPreference";

const OPTION_LABEL: Record<AdminDialectPreference, string> = {
  uk: "英式（BrE）",
  us: "美式（AmE）"
};

/**
 * 个人设置 → 英语方言偏好（A1）。切换即时生效并持久化；
 * 显示值由偏好内核驱动，保存失败时不会更新，界面自动停在原值。
 */
export function DialectPreference() {
  const { preference, savePreference } = useDialectPreference();
  const { message } = App.useApp();

  const change = (value: AdminDialectPreference) => {
    if (value === preference) return;
    try {
      savePreference(value);
      // 只说「已保存」这件真实发生的事：消费这个偏好的创建向导与预览尚未改造完成
      // （见 design.md 阶段 2–5），此刻声称「口径已切换」会变成又一处伪造成功反馈。
      message.success(`已保存英语方言偏好：${OPTION_LABEL[value]}`);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "方言偏好未能保存"
      );
    }
  };

  return (
    <Card size="small" title="英语方言偏好" style={{ maxWidth: 720 }}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          决定你录入与查看英文内容的默认口径，试听发音人也按此选择。
          词条自身的英美拼写由内置词典决定，不受影响。
        </Typography.Text>
        <Radio.Group
          value={preference}
          onChange={(event) =>
            change(event.target.value as AdminDialectPreference)
          }
        >
          <Radio value="uk">{OPTION_LABEL.uk}</Radio>
          <Radio value="us">{OPTION_LABEL.us}</Radio>
        </Radio.Group>
      </Space>
    </Card>
  );
}
