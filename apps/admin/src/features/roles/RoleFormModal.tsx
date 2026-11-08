import { hasDisplayNameForbiddenChars } from "@tsz/shared";
import { RoleActionErrorText } from "./action-error";
import {
  useAccessTranslation,
  AccessText,
  accessLabel
} from "../permissions/i18n";
// 建 / 改角色弹窗（super_admin）：角色名 + 描述 + 权限勾选框（从 GET /admin/permissions 拉，
// 按目录=侧栏顺序渲染，对角色已有集合打勾）。权限集提交即「全量替换」：把当前勾中的完整数组
// 塞 permissions（编辑时也照发，等价于按现状替换）。校验对齐 §3/§4：名称 1–50、无 < >/控制字符。
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Alert, Button, Col, Row, Spin, Tag } from "@tsz/ui/admin/display";
import { Checkbox, Form, Input } from "@tsz/ui/admin/forms";
import { useEffect, useState } from "react";
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
  ROLE_NAME_MAX
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
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const catalog = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const invalidate = useInvalidateRoles();

  const [nameTaken, setNameTaken] = useState(false);
  const isEdit = role !== null;
  const items = catalog.data?.permissions ?? [];

  // 打开时把表单灌成「新建=空 / 编辑=该角色现状」。用 effect 而非 Modal.afterOpenChange：
  // 后者依赖开场动画的 transitionend，在 jsdom（无动画）里不触发，会导致编辑态回填落空。
  useEffect(() => {
    if (open) {
      setNameTaken(false);
      form.setFieldsValue({
        name: role?.name ?? "",
        description: role?.description ?? "",
        permissions: role?.permissions ?? []
      });
    }
  }, [open, role, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setNameTaken(false);
    const input: CreateRoleRequest = {
      name: values.name.trim(),
      description: values.description?.trim() ?? "",
      // 全量替换：直接把当前勾中的完整数组塞 permissions（空数组 = 仅首页）。
      permissions: values.permissions ?? []
    };
    try {
      if (role) await updateRole.mutateAsync({ id: role.id, input });
      else await createRole.mutateAsync(input);
      message.success(
        isEdit ? (
          <AccessText message="saved" />
        ) : (
          <AccessText message="role_created" />
        )
      );
      onClose();
    } catch (err) {
      // 409 = 大小写不敏感重名：高亮名称输入框（§3/§4）。
      if (err instanceof HttpError && err.status === 409) {
        setNameTaken(true);
        return;
      }
      // 唯一可据 code 精确处理的 400：勾了目录外 key → 提示并重拉目录（§3）。
      if (isUnknownPermissionKeyError(err)) {
        message.error(
          <AccessText message="some_permissions_are_no_longer_valid_refresh_the_permission_catal" />
        );
        void catalog.refetch();
        return;
      }
      // 其余 400（名称非法等）：一律展示后端 error 原文并停留重填，不匹配英文文案（§3）。
      if (err instanceof HttpError && err.status === 400) {
        message.error(
          err.message || <AccessText message="invalid_parameters" />
        );
        return;
      }
      // 403（系统角色/非超管）/ 404（并发删）/ 网络等：提示并关闭；404 时刷新列表。
      message.error(
        <RoleActionErrorText error={err} fallback="could_not_save" />
      );
      if (err instanceof HttpError && err.status === 404) invalidate();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      title={
        isEdit ? t("edit_role_title", { name: role.name }) : t("create_role")
      }
      okText={isEdit ? t("save") : t("create")}
      cancelText={t("cancel")}
      width={560}
      confirmLoading={createRole.isPending || updateRole.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        onValuesChange={(changed) => {
          if ("name" in changed) setNameTaken(false);
        }}
      >
        <Form.Item
          name="name"
          validateStatus={nameTaken ? "error" : undefined}
          help={
            nameTaken ? (
              <AccessText message="this_role_name_already_exists" />
            ) : undefined
          }
          label={t("role_name")}
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: <AccessText message="enter_a_role_name" />
            },
            {
              message: (
                <AccessText
                  message="role_name_max"
                  params={{ max: ROLE_NAME_MAX }}
                />
              ),
              validator: (_, v: string) =>
                Array.from((v ?? "").trim()).length > ROLE_NAME_MAX
                  ? Promise.reject(new Error("role_name_too_long"))
                  : Promise.resolve()
            },
            {
              message: (
                <AccessText message="role_names_cannot_contain_or_control_characters" />
              ),
              validator: (_, v: string) =>
                hasDisplayNameForbiddenChars((v ?? "").trim())
                  ? Promise.reject(new Error("invalid_role_name"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input
            placeholder={t("e_g_lexicon_administrator")}
            allowClear
            maxLength={ROLE_NAME_MAX}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label={t("description_optional")}
          rules={[
            {
              max: ROLE_DESC_MAX,
              message: (
                <AccessText
                  message="max_characters"
                  params={{ max: ROLE_DESC_MAX }}
                />
              )
            }
          ]}
        >
          <Input.TextArea
            placeholder={t("what_this_role_can_do")}
            allowClear
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={ROLE_DESC_MAX}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="permissions"
          label={t("menu_permissions")}
          extra={t(
            "select_the_admin_menus_this_role_can_access_selecting_none_leaves"
          )}
        >
          {catalog.isPending ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <Spin size="small" />
            </div>
          ) : catalog.isError ? (
            <Alert
              type="error"
              showIcon
              title={t("could_not_load_the_permission_catalog")}
              description={catalog.error.message}
              action={
                <Button size="small" onClick={() => void catalog.refetch()}>
                  {t("try_again")}
                </Button>
              }
            />
          ) : (
            <Checkbox.Group style={{ width: "100%" }}>
              <Row gutter={[8, 8]} style={{ width: "100%" }}>
                {items.map((item) => (
                  <Col span={12} key={item.key}>
                    <Checkbox value={item.key}>
                      {accessLabel(item.label, t)}
                      {!isPermissionLanded(item.key) && (
                        <Tag
                          color="orange"
                          variant="filled"
                          style={{ marginInlineStart: 6 }}
                        >
                          {t("unreleased")}
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
