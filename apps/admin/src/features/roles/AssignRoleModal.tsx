import { RoleActionErrorText } from "./action-error";
import { useAccessTranslation, AccessText } from "../permissions/i18n";
// 派角色弹窗（super_admin）：把某个「普通管理员」设为某角色，或收回（降为仅首页）。
// 按 §6 红框做「单向指派」：后端本期不下发管理员当前所属角色，故控件不回显当前值、
// 只承诺「设为 / 收回」，不做「显示并切换」。超管不挂角色（派超管回 403），故管理员下拉
// 只取 role=admin。204 后由 useSetAdminRole 失效角色列表刷新 member_count。
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Alert } from "@tsz/ui/admin/display";
import { Form, Select } from "@tsz/ui/admin/forms";
import type { AdminRole } from "@tsz/types";
import { useAdminList } from "@/features/admins/api";
import { useSetAdminRole } from "./api";

/** 角色下拉里「收回角色」这一项的哨兵值（提交时映射为 role_id: null）。 */
const CLEAR_ROLE = "__clear__";

interface FormValues {
  adminId: string;
  roleId: string;
}

interface Props {
  open: boolean;
  /** 角色下拉候选（来自列表页已加载的角色，含系统角色——可把管理员设回全功能）。 */
  roles: AdminRole[];
  onClose: () => void;
}

export function AssignRoleModal({ open, roles, onClose }: Props) {
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  // 仅普通管理员可被派角色；超管不挂角色。一次取较多，前端本地搜索（当前规模足够）。
  const adminList = useAdminList({ role: "admin", page_size: 100 });
  const setAdminRole = useSetAdminRole();

  const adminOptions = (adminList.data?.items ?? []).map((a) => ({
    value: a.id,
    label: t("admin_option", { name: a.display_name, phone: a.phone })
  }));

  const roleOptions = [
    { value: CLEAR_ROLE, label: t("remove_role_dashboard_access_only") },
    ...roles.map((r) => ({
      value: r.id,
      label: r.is_system ? t("system_role_option", { name: r.name }) : r.name
    }))
  ];

  const submit = async () => {
    const values = await form.validateFields();
    const roleId = values.roleId === CLEAR_ROLE ? null : values.roleId;
    try {
      await setAdminRole.mutateAsync({ adminId: values.adminId, roleId });
      message.success(
        roleId === null ? (
          <AccessText message="role_removed" />
        ) : (
          <AccessText message="role_assigned" />
        )
      );
      onClose();
    } catch (err) {
      // 403 = 目标是超管 / 非超管；404 = 管理员或角色不存在。停留让超管改选后重试。
      message.error(
        <RoleActionErrorText error={err} fallback="assignment_failed" />
      );
    }
  };

  return (
    <Modal
      open={open}
      title={t("assign_role")}
      okText={t("assign")}
      cancelText={t("cancel")}
      confirmLoading={setAdminRole.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={t(
          "the_current_role_is_not_recorded_here_this_action_assigns_the_sel"
        )}
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="adminId"
          label={t("administrator")}
          rules={[
            {
              required: true,
              message: <AccessText message="select_an_administrator" />
            }
          ]}
        >
          <Select
            placeholder={t("select_a_standard_administrator")}
            showSearch
            optionFilterProp="label"
            loading={adminList.isPending}
            options={adminOptions}
            notFoundContent={
              adminList.isPending
                ? t("loading")
                : t("no_standard_administrators")
            }
          />
        </Form.Item>
        <Form.Item
          name="roleId"
          label={t("role")}
          rules={[
            {
              required: true,
              message: <AccessText message="select_a_role_or_remove_the_role" />
            }
          ]}
        >
          <Select
            placeholder={t("assign_or_remove_a_role")}
            showSearch
            optionFilterProp="label"
            options={roleOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
