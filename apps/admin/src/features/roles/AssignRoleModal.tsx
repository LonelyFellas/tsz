// 派角色弹窗（super_admin）：把某个「普通管理员」设为某角色，或收回（降为仅首页）。
// 按 §6 红框做「单向指派」：后端本期不下发管理员当前所属角色，故控件不回显当前值、
// 只承诺「设为 / 收回」，不做「显示并切换」。超管不挂角色（派超管回 403），故管理员下拉
// 只取 level=admin。204 后由 useSetAdminRole 失效角色列表刷新 member_count。
import { App, Alert, Form, Modal, Select } from "antd";
import type { AdminRole } from "@tsz/types";
import { useAdminList } from "@/features/admins/api";
import { useSetAdminRole } from "./api";
import { roleMutationError } from "./labels";

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
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  // 仅普通管理员可被派角色；超管不挂角色。一次取较多，前端本地搜索（当前规模足够）。
  const adminList = useAdminList({ level: "admin", page_size: 100 });
  const setAdminRole = useSetAdminRole();

  const adminOptions = (adminList.data?.items ?? []).map((a) => ({
    value: a.id,
    label: `${a.display_name}（${a.phone}）`
  }));

  const roleOptions = [
    { value: CLEAR_ROLE, label: "收回角色（降为仅首页）" },
    ...roles.map((r) => ({
      value: r.id,
      label: r.is_system ? `${r.name}（系统）` : r.name
    }))
  ];

  const submit = async () => {
    const values = await form.validateFields();
    const roleId = values.roleId === CLEAR_ROLE ? null : values.roleId;
    try {
      await setAdminRole.mutateAsync({ adminId: values.adminId, roleId });
      message.success(roleId === null ? "已收回角色" : "已指派角色");
      onClose();
    } catch (err) {
      // 403 = 目标是超管 / 非超管；404 = 管理员或角色不存在。停留让超管改选后重试。
      message.error(roleMutationError(err, "指派失败"));
    }
  };

  return (
    <Modal
      open={open}
      title="指派角色"
      okText="指派"
      cancelText="取消"
      confirmLoading={setAdminRole.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="后台不记录管理员当前所属角色，此处为单向操作：选定后把该管理员设为所选角色，或收回为仅首页。被改管理员的菜单在其下次进入后台时生效。"
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="adminId"
          label="管理员"
          rules={[{ required: true, message: "请选择管理员" }]}
        >
          <Select
            placeholder="选择一名普通管理员"
            showSearch
            optionFilterProp="label"
            loading={adminList.isPending}
            options={adminOptions}
            notFoundContent={
              adminList.isPending ? "加载中..." : "暂无普通管理员"
            }
          />
        </Form.Item>
        <Form.Item
          name="roleId"
          label="角色"
          rules={[{ required: true, message: "请选择角色或收回" }]}
        >
          <Select
            placeholder="设为某角色，或收回"
            showSearch
            optionFilterProp="label"
            options={roleOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
