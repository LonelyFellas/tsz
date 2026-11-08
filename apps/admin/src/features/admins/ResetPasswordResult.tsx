import { useAccessTranslation, AccessText } from "../permissions/i18n";
// 重置密码结果弹窗：一次性展示临时密码（仅此一次返回），提供复制。
import { CopyIcon } from "lucide-react";
import { Alert, Button, Typography } from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { copyText } from "@/lib/clipboard";

interface Props {
  /** 临时密码明文；null = 不展示。 */
  password: string | null;
  /** 目标管理员昵称（提示语用）。 */
  adminName?: string;
  onClose: () => void;
}

export function ResetPasswordResult({ password, adminName, onClose }: Props) {
  const { t } = useAccessTranslation();
  const { message } = App.useApp();

  // 自持复制并校验真实成败：不依赖 antd copyable 的静默成功态，避免非安全上下文下
  // 谎报「已复制」→ 操作者关窗后永久丢失这枚一次性密码。见 @/lib/clipboard 注释。
  const handleCopy = async () => {
    if (!password) return;
    if (await copyText(password)) {
      message.success(<AccessText message="temporary_password_copied" />);
    } else {
      message.warning(
        <AccessText message="could_not_copy_select_and_copy_the_password_below_manually" />
      );
    }
  };

  return (
    <Modal
      open={!!password}
      title={t("temporary_password_generated")}
      okText={t("i_have_copied_it")}
      onOk={onClose}
      onCancel={onClose}
      cancelButtonProps={{ style: { display: "none" } }}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title={t("this_password_is_shown_only_once")}
        description={
          adminName
            ? t("password_handoff", { name: adminName })
            : t("password_handoff_unnamed")
        }
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
              background: "var(--ui-color-fill-alter)",
              borderRadius: 8,
              margin: "0 0 12px",
              userSelect: "all"
            }}
          >
            {password}
          </Typography.Paragraph>
          <Button icon={<CopyIcon />} onClick={() => void handleCopy()}>
            {t("copy_password")}
          </Button>
        </>
      )}
    </Modal>
  );
}
