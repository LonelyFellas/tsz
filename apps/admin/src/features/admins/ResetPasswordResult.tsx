// 重置密码结果弹窗：一次性展示临时密码（仅此一次返回），提供复制。
import { CopyOutlined } from "@ant-design/icons";
import { Alert, App, Button, Modal, Typography } from "antd";
import { copyText } from "@/lib/clipboard";

interface Props {
  /** 临时密码明文；null = 不展示。 */
  password: string | null;
  /** 目标管理员昵称（提示语用）。 */
  adminName?: string;
  onClose: () => void;
}

export function ResetPasswordResult({ password, adminName, onClose }: Props) {
  const { message } = App.useApp();

  // 自持复制并校验真实成败：不依赖 antd copyable 的静默成功态，避免非安全上下文下
  // 谎报「已复制」→ 操作者关窗后永久丢失这枚一次性密码。见 @/lib/clipboard 注释。
  const handleCopy = async () => {
    if (!password) return;
    if (await copyText(password)) {
      message.success("已复制临时密码");
    } else {
      message.warning("复制失败，请手动选中下方密码复制");
    }
  };

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
        <>
          {/* 明文 monospace 可选中：即便复制失败也能手动取回（关键缓解，勿删）。
              user-select: all 让单击即选中整串，方便降级时手动复制。 */}
          <Typography.Paragraph
            style={{
              fontSize: 18,
              fontFamily: "monospace",
              padding: "8px 12px",
              background: "rgba(0,0,0,0.04)",
              borderRadius: 8,
              margin: "0 0 12px",
              userSelect: "all"
            }}
          >
            {password}
          </Typography.Paragraph>
          <Button icon={<CopyOutlined />} onClick={() => void handleCopy()}>
            复制密码
          </Button>
        </>
      )}
    </Modal>
  );
}
