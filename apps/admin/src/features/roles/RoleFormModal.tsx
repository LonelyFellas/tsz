// 建 / 改角色弹窗（super_admin）：角色名 + 描述 + 权限勾选框（从 GET /admin/permissions 拉，
// 按目录=侧栏顺序渲染，对角色已有集合打勾）。权限集提交即「全量替换」：把当前勾中的完整数组
// 塞 permissions（编辑时也照发，等价于按现状替换）。校验对齐 §3/§4：名称 1–50、无 < >/控制字符。
import {
  App,
  Alert,
  Button,
  Checkbox,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Spin,
  Tag
} from "antd";
import { useEffect } from "react";
import type { AdminRole, CreateRoleRequest, PermissionKey } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import {
  useCreateRole,
  useInvalidateRoles,
  usePermissionCatalog,
  useUpdateRole
} from "./api";
import {
  isPermissionLanded,
  isUnknownPermissionKeyError,
  ROLE_DESC_MAX,
  ROLE_NAME_MAX,
  roleMutationError,
  validateRoleName
} from "./labels";

interface FormValues {
  name: string;
  description?: string;
  permissions?: PermissionKey[];
}

interface Props {
  open: boolean;
  /** null = 新建；否则编辑该角色。系统角色不进此弹窗（列表入口已置灰）。 */
  role: AdminRole | null;
  onClose: () => void;
}

export function RoleFormModal({ open, role, onClose }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const catalog = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const invalidate = useInvalidateRoles();

  const isEdit = role !== null;
  const items = catalog.data?.items ?? [];

  // 打开时把表单灌成「新建=空 / 编辑=该角色现状」。用 effect 而非 Modal.afterOpenChange：
  // 后者依赖开场动画的 transitionend，在 jsdom（无动画）里不触发，会导致编辑态回填落空。
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: role?.name ?? "",
        description: role?.description ?? "",
        permissions: role?.permissions ?? []
      });
    }
  }, [open, role, form]);

  const submit = async () => {
    const values = await form.validateFields();
    const input: CreateRoleRequest = {
      name: values.name.trim(),
      description: values.description?.trim() ?? "",
      // 全量替换：直接把当前勾中的完整数组塞 permissions（空数组 = 仅首页）。
      permissions: values.permissions ?? []
    };
    try {
      if (role) await updateRole.mutateAsync({ id: role.id, input });
      else await createRole.mutateAsync(input);
      message.success(isEdit ? "已保存" : "角色已创建");
      onClose();
    } catch (err) {
      // 409 = 大小写不敏感重名：高亮名称输入框（§3/§4）。
      if (err instanceof HttpError && err.status === 409) {
        form.setFields([{ name: "name", errors: ["角色名已存在"] }]);
        return;
      }
      // 唯一可据 code 精确处理的 400：勾了目录外 key → 提示并重拉目录（§3）。
      if (isUnknownPermissionKeyError(err)) {
        message.error("有权限项已失效，请刷新权限目录后重试");
        void catalog.refetch();
        return;
      }
      // 其余 400（名称非法等）：一律展示后端 error 原文并停留重填，不匹配英文文案（§3）。
      if (err instanceof HttpError && err.status === 400) {
        message.error(err.message || "参数不合法");
        return;
      }
      // 403（系统角色/非超管）/ 404（并发删）/ 网络等：提示并关闭；404 时刷新列表。
      message.error(roleMutationError(err, "保存失败"));
      if (err instanceof HttpError && err.status === 404) invalidate();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `编辑角色：${role.name}` : "新建角色"}
      okText={isEdit ? "保存" : "创建"}
      cancelText="取消"
      width={560}
      confirmLoading={createRole.isPending || updateRole.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="name"
          label="角色名"
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: "请输入角色名"
            },
            {
              validator: (_, v: string) => {
                const err = v ? validateRoleName(v) : null;
                return err ? Promise.reject(new Error(err)) : Promise.resolve();
              }
            }
          ]}
        >
          <Input
            placeholder="如：词库管理员"
            allowClear
            maxLength={ROLE_NAME_MAX}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label="描述（可选）"
          rules={[
            { max: ROLE_DESC_MAX, message: `最长 ${ROLE_DESC_MAX} 字符` }
          ]}
        >
          <Input.TextArea
            placeholder="这个角色能做什么"
            allowClear
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={ROLE_DESC_MAX}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="permissions"
          label="菜单权限"
          extra="勾选该角色可访问的后台菜单；不勾任何项 = 仅可见首页。「未上线」项可先勾选，对应菜单落地前仍为置灰。"
        >
          {catalog.isPending ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <Spin size="small" />
            </div>
          ) : catalog.isError ? (
            <Alert
              type="error"
              showIcon
              title="权限目录加载失败"
              description={catalog.error.message}
              action={
                <Button size="small" onClick={() => void catalog.refetch()}>
                  重试
                </Button>
              }
            />
          ) : (
            <Checkbox.Group style={{ width: "100%" }}>
              <Row gutter={[8, 8]} style={{ width: "100%" }}>
                {items.map((item) => (
                  <Col span={12} key={item.key}>
                    <Checkbox value={item.key}>
                      {item.label}
                      {!isPermissionLanded(item.key) && (
                        <Tag
                          color="orange"
                          variant="filled"
                          style={{ marginInlineStart: 6 }}
                        >
                          未上线
                        </Tag>
                      )}
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}
