// 重置密码结果弹窗：一次性展示临时密码（仅此一次返回），提供复制。
import { Alert, Modal, Typography } from "antd";

interface Props {
  /** 临时密码明文；null = 不展示。 */
  password: string | null;
  /** 目标管理员昵称（提示语用）。 */
  adminName?: string;
  onClose: () => void;
}

export function ResetPasswordResult({ password, adminName, onClose }: Props) {
  return (
    <Modal
      open={!!password}
      title="临时密码已生成"
      okText="我已复制"
      onOk={onClose}
      onCancel={onClose}
      cancelButtonProps={{ style: { display: "none" } }}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="此密码仅显示一次"
        description={`请复制后线下转交${adminName ? `「${adminName}」` : "该管理员"}，对方下次登录须修改。关闭后无法再次查看。`}
      />
      {password && (
        <Typography.Paragraph
          copyable={{ text: password }}
          style={{
            fontSize: 18,
            fontFamily: "monospace",
            padding: "8px 12px",
            background: "rgba(0,0,0,0.04)",
            borderRadius: 8,
            margin: 0
          }}
        >
          {password}
        </Typography.Paragraph>
      )}
    </Modal>
  );
}
